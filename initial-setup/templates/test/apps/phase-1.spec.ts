// tslint:disable:no-any
import 'jest';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { resourcesToList, stackToCloudFormation } from '../jest';
import * as phase1 from '../../src/apps/phase-1';
import { createPhaseInput } from './phase-input';
import { CentralBucketOutputType, LogBucketOutputType } from '../../src/deployments/defaults';

test('the bucket names and IDs in phase 1 should not change', async () => {
  const input = createPhaseInput('1');

  input.outputs.push({
    accountKey: 'master',
    outputValue: JSON.stringify({
      type: CentralBucketOutputType.name,
      value: {
        bucketArn: 'arn:aws:s3:::123',
        bucketName: 'central-bucket',
        encryptionKeyArn: 'arn:aws:kms:ca-central-1:111111111111:key/test',
      },
    }),
  });
  input.outputs.push({
    accountKey: 'log-archive',
    outputValue: JSON.stringify({
      type: LogBucketOutputType.name,
      value: {
        bucketArn: 'arn:aws:s3:::123',
        bucketName: 'central-bucket',
        encryptionKeyArn: 'arn:aws:kms:ca-central-1:111111111111:key/test',
      },
    }),
  });

  // Mock STS and S3 as the IAM logic is currently contacting S3 using the SDK
  // @ts-ignore
  jest.spyOn(STS.prototype, 'getCredentialsForAccountAndRole').mockImplementation(() => Promise.resolve(undefined));
  jest.spyOn(S3.prototype, 'getObjectBodyAsString').mockImplementation(() => Promise.resolve(''));

  await phase1.deploy(input);

  for (const stack of input.accountStacks.stacks) {
    // Convert the stack to a CloudFormation template
    const template = stackToCloudFormation(stack);
    const resources = resourcesToList(template.Resources);

    // Only take a snapshot of buckets and LogicalId and BucketName
    const expected = resources
      .filter(r => r.Type === 'AWS::S3::Bucket')
      .map(b => ({
        LogicalId: b.LogicalId,
        Properties: {
          BucketName: b.Properties.BucketName,
        },
      }));

    expect(expected).toMatchSnapshot(stack.stackName);
  }
});
