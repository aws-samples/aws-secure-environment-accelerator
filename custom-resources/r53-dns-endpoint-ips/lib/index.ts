import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface R53DnsEndPointIpsProps {
  resolverEndpointId: string;
  subnetsCount: number;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class R53DnsEndPointIps extends cdk.Construct {
  readonly endpointIps: string[] = [];

  constructor(scope: cdk.Construct, id: string, props: R53DnsEndPointIpsProps) {
    super(scope, id);
    const { resolverEndpointId, subnetsCount } = props;

    const physicalResourceId = custom.PhysicalResourceId.of(resolverEndpointId);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Route53Resolver',
      action: 'listResolverEndpointIpAddresses',
      physicalResourceId,
      parameters: {
        ResolverEndpointId: resolverEndpointId
      },
    };

    const customResource = new custom.AwsCustomResource(this, 'Resource', {
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
    
    for (let count=0; count <  subnetsCount; count++) {
      this.endpointIps.push(customResource.getResponseField(`IpAddresses.${count}.Ip`));
    }
  }
}
