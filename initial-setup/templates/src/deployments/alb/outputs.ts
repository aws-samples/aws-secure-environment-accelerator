import * as t from 'io-ts';
import { StructuredOutput } from '../../common/structured-output';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { FirewallInstanceOutputType } from '../firewall/cluster/outputs';

export const AesBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
  },
  'AesBucket',
);

export type AesBucketOutput = t.TypeOf<typeof AesBucketOutputType>;

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
