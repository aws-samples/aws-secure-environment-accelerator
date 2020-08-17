import * as cdk from '@aws-cdk/core';
import * as ram from '@aws-cdk/aws-ram';

export interface TransitGatewaySharingProps {
  name: string;
  tgwId: string;
  principals: string[];
}

export class TransitGatewaySharing extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: TransitGatewaySharingProps) {
    super(scope, id);

    new ram.CfnResourceShare(this, 'Resource', {
      name: props.name,
      principals: props.principals,
      resourceArns: [`arn:aws:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:transit-gateway/${props.tgwId}`],
    });
  }
}
