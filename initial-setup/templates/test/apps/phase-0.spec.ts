// tslint:disable:no-any
import 'jest';
import { resourcesToList, stackToCloudFormation } from '../jest';
import * as phase0 from '../../src/apps/phase-0';
import { createPhaseInput } from './phase-input';

test('the bucket names and IDs in phase 0 should not change', async () => {
  const input = createPhaseInput('0');

  await phase0.deploy(input);

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
