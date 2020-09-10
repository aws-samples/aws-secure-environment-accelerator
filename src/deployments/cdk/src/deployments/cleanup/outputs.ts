import * as t from 'io-ts';
import { createCfnStructuredOutput } from '../../common/structured-output';
import { createStructuredOutputFinder } from '@aws-accelerator/common-outputs/src/structured-output';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export const ResourceCleanupOutput = t.interface(
  {
    bucketPolicyCleanup: t.boolean,
  },
  'ResourceCleanupOutput',
);

export type ResourceCleanupOutput = t.TypeOf<typeof ResourceCleanupOutput>;

export const CfnResourceCleanupOutput = createCfnStructuredOutput(ResourceCleanupOutput);

export const ResourceCleanupOutputFinder = createStructuredOutputFinder(ResourceCleanupOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey?: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));
