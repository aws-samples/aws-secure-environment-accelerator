import * as cdk from '@aws-cdk/core';
import * as ram from '@aws-cdk/aws-ram';

const subnetArnTemplate = 'arn:aws:ec2:region:accountId:subnet/subnetId';

export interface VPCSharingProps extends cdk.StackProps {
  subnetId: string;
  sourceAccountId: string;
  targetAccountIds: string[];
  region?: string;
}

export class VPCSharing extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: VPCSharingProps) {
    super(scope, id);

    const subnetArn = prepareSubnetIdArn(props.subnetId, props.sourceAccountId, props.region);
    new ram.CfnResourceShare(this, 'vpc_sharing', {
      name: 'vpc-sharing',
      allowExternalPrincipals: false,
      principals: props.targetAccountIds,
      resourceArns: [subnetArn],
    });
  }
}

function prepareSubnetIdArn(subId: string, acctId: string, regnId?: string) {
  let modifiedString = replaceAll(subnetArnTemplate, {
    subnetId: subId,
    accountId: acctId,
    region: regnId,
  });
  return modifiedString;
}

function replaceAll(templateArn: String, inputs: any) {
  var regexp = new RegExp(Object.keys(inputs).join('|'), 'gi');
  var modified_string = templateArn.replace(regexp, function (matched) {
    return inputs[matched];
  });
  return modified_string;
}
