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
      name: `${id}_Subnet_Sharing`,
      allowExternalPrincipals: false,
      principals: props.targetAccountIds,
      resourceArns: [subnetArn],
    });
  }
}

// Function to prepare actual Subnet ARN by taking inputs of region, accountId and subnetId
function prepareSubnetIdArn(subId: string, acctId: string, regnId?: string) {
  const modifiedString = replaceAll(subnetArnTemplate, {
    subnetId: subId,
    accountId: acctId,
    region: regnId,
  });
  return modifiedString;
}

function replaceAll(templateArn: string, inputs: any) {
  const regexp = new RegExp(Object.keys(inputs).join('|'), 'gi');
  const modifiedString = templateArn.replace(regexp, function getSubnetArn(matched: string) {
    return inputs[matched];
  });
  return modifiedString;
}
