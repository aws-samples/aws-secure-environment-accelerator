import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface VpnAttachmentsProps {
  vpnConnectionId: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class VpnAttachments extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: VpnAttachmentsProps) {
    super(scope, id);
    const { vpnConnectionId } = props;

    const physicalResourceId = custom.PhysicalResourceId.of(vpnConnectionId);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'EC2',
      action: 'describeTransitGatewayAttachments',
      physicalResourceId,
      parameters: {
        Filters: [
          {
            Name: 'resource-id',
            Values: [
              props.vpnConnectionId,
            ]
          },
        ],
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::VpnAttachments',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ec2:DescribeTransitGatewayAttachments'],
          resources: ['*'],
        }),
      ]),
    });
  }

  getTransitGatewayAttachmentId(index: number): string {
    return this.resource.getResponseField(`TransitGatewayAttachments.${index}.TransitGatewayAttachmentId`);
  }
}
