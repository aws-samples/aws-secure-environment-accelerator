import * as cdk from '@aws-cdk/core';
import * as ram from '@aws-cdk/aws-ram';

export interface VpcSharingProps extends cdk.StackProps {
  subnetId: string;
  sourceAccountId: string;
  targetAccountIds: string[];
  region: string;
}

export class VpcSharing extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: VpcSharingProps) {
    super(scope, id);
    const subnetArn = `arn:aws:ec2:${props.region}:${props.sourceAccountId}:subnet/${props.subnetId}`;
    new ram.CfnResourceShare(this, 'vpc_sharing', {
      name: `${id}_Subnet_Sharing`,
      allowExternalPrincipals: false,
      principals: props.targetAccountIds,
      resourceArns: [subnetArn],
    });
  }
}
