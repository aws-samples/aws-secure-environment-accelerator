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
  tryFindOneByName: (props: {
    outputs: StackOutput[];
    accountKey?: string;
    region?: string;
    bucketPolicyCleanup?: boolean;
  }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
      predicate: r => r.bucketPolicyCleanup === props.bucketPolicyCleanup,
    }),
}));

export const ResourceStackCleanupOutput = t.interface(
  {
    cdkStackCleanup: t.boolean,
  },
  'CdkStackCleanupOutput',
);

export type ResourceStackCleanupOutput = t.TypeOf<typeof ResourceStackCleanupOutput>;

export const CfnResourceStackCleanupOutput = createCfnStructuredOutput(ResourceStackCleanupOutput);

export const ResourceStackCleanupOutputFinder = createStructuredOutputFinder(ResourceStackCleanupOutput, finder => ({
  tryFindOneByName: (props: {
    outputs: StackOutput[];
    accountKey?: string;
    region?: string;
    cdkStackCleanup: boolean;
  }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
      predicate: r => r.cdkStackCleanup === props.cdkStackCleanup,
    }),
}));
