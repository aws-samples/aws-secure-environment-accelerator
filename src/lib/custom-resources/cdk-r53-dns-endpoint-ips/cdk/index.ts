import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface R53DnsEndpointIpsProps {
  resolverEndpointId: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class R53DnsEndpointIps extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: R53DnsEndpointIpsProps) {
    super(scope, id);
    const { resolverEndpointId } = props;

    const physicalResourceId = custom.PhysicalResourceId.of(resolverEndpointId);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Route53Resolver',
      action: 'listResolverEndpointIpAddresses',
      physicalResourceId,
      parameters: {
        ResolverEndpointId: resolverEndpointId,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::LogResourcePolicy',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['route53resolver:ListResolverEndpointIpAddresses'],
          resources: ['*'],
        }),
      ]),
    });
  }

  getEndpointIpAddress(index: number): string {
    return this.resource.getResponseField(`IpAddresses.${index}.Ip`);
  }
}
