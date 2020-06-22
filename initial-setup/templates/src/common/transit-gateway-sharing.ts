import { Construct } from '@aws-cdk/core';
import * as ram from '@aws-cdk/aws-ram';


export interface TransitGatewaySharingProps {
  name: string;
  region: string;
  accountId: string;
  tgwId: string;
  masterAccountId: string;
  orgId: string;
}

export class TransitGatewaySharing extends Construct {
  constructor(scope: Construct, id: string, props: TransitGatewaySharingProps) {
    super(scope, id);

    new ram.CfnResourceShare(this, `Share-${props.name}`, {
      name: props.name,
      principals: [`arn:aws:organizations::${props.masterAccountId}:organization/${props.orgId}`],
      resourceArns: [`arn:aws:ec2:${props.region}:${props.accountId}:transit-gateway/${props.tgwId}`],
    });
  }
}