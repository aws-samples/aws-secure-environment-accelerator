import * as t from 'io-ts';
import { Vpc, SecurityGroup } from '@aws-pbmm/constructs/lib/vpc';
import { StructuredOutput } from '../../common/structured-output';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

export const AesBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
  },
  'AesBucket',
);

export type AesBucketOutput = t.TypeOf<typeof AesBucketOutputType>;

export const FirewallInstanceOutputType = t.interface(
  {
    id: t.string,
    name: t.string,
    az: t.string,
  },
  'FirewallInstanceOutput',
);

export type FirewallInstanceOutput = t.TypeOf<typeof FirewallInstanceOutputType>;

export function createAlbName(accountKey: string, albName: string): string {
  return `${albName}-${accountKey}-alb`;
}

export function createTargetGroupName(albName: string, targetGroupName: string): string {
  return `${albName}-${targetGroupName}`;
}

export function getEc2Instances(
  accountKey: string,
  outputs: StackOutput[],
  targetInstances: string[],
): { [instanceName: string]: string } | undefined {
  const instanceOutputs = StructuredOutput.fromOutputs(outputs, {
    type: FirewallInstanceOutputType,
    accountKey,
  });
  const ec2Instances: { [instanceName: string]: string } = {};
  for (const instanceName of targetInstances) {
    const instance = instanceOutputs.find(i => i.name === instanceName);
    if (!instance) {
      console.warn(`Cannot find output with ALB instance name ${instanceName}`);
      return;
    }
    ec2Instances[instanceName] = instance.id;
  }
  return ec2Instances;
}

export function getVpc(vpcOutputs: Vpc[], vpcName: string): Vpc | undefined {
  const vpc = vpcOutputs.find(v => v.name === vpcName);
  if (!vpc) {
    console.warn(`Cannot find output with vpc name ${vpcName}`);
    return;
  }
  return vpc;
}

export function getSubnetIds(vpc: Vpc, subnet: string): string[] | undefined {
  const subnetIds = vpc.tryFindSubnetIdsByName(subnet);
  if (!subnetIds) {
    console.warn(`Cannot find output with subnet name ${subnet}`);
    return;
  }
  return subnetIds;
}

export function getAesLogArchiveBucket(outputs: StackOutput[], accountKey: string): string | undefined {
  const logArchiveBuckets = StructuredOutput.fromOutputs(outputs, {
    type: AesBucketOutputType,
    accountKey: accountKey,
  });
  if (logArchiveBuckets.length === 0) {
    console.warn(`Cannot find output with ${accountKey} ${AesBucketOutputType.name}`);
    return;
  }
}

export function getSecurityGroup(securityGroupName: string, vpc: Vpc): SecurityGroup | undefined {
  const securityGroup = vpc.tryFindSecurityGroupByName(securityGroupName);
  if (!securityGroup) {
    console.warn(`Cannot find output with security name ${securityGroupName}`);
    return;
  }
  return securityGroup;
}
