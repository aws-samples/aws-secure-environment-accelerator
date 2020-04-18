import * as cdk from '@aws-cdk/core';
import * as ram from '@aws-cdk/aws-ram';

export interface VpcSubnetShareProps {
  name: string;
  subnetIds: string[];
  sourceAccountId: string;
  targetAccountIds: string[];
  region: string;
}

export class VpcSubnetShare extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: VpcSubnetShareProps) {
    super(scope, id);

    const subnetArns = props.subnetIds.map(
      subnetId => `arn:aws:ec2:${props.region}:${props.sourceAccountId}:subnet/${subnetId}`,
    );

    new ram.CfnResourceShare(this, 'Share', {
      name: props.name,
      allowExternalPrincipals: false,
      principals: props.targetAccountIds,
      resourceArns: subnetArns,
    });
  }
}
