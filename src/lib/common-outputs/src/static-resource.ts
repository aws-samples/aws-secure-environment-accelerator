import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';
import { enumType, optional } from '@aws-accelerator/common-types';

export const RESOURCETYPE = ['PUBLIC', 'PRIVATE'] as const;

export const ResourceType = enumType<typeof RESOURCETYPE[number]>(RESOURCETYPE, 'ResourceType');

export const StaticResourcesOutput = t.interface(
  {
    id: t.string,
    region: t.string,
    accountKey: t.string,
    suffix: t.number,
    resourceType: t.string,
    resources: t.array(t.string),
  },
  'StaticResourcesOutput',
);

export type StaticResourcesOutput = t.TypeOf<typeof StaticResourcesOutput>;

export const StaticResourcesOutputFinder = createStructuredOutputFinder(StaticResourcesOutput, finder => ({
  tryFindOneByAccountAndRegionAndType: (props: {
    outputs: StackOutput[];
    accountKey?: string;
    region?: string;
    resourceType?: string;
    suffix?: number;
  }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      predicate: output =>
        (props.accountKey === undefined || output.accountKey === props.accountKey) &&
        (props.region === undefined || output.region === props.region) &&
        (props.resourceType === undefined || output.resourceType === props.resourceType) &&
        (props.suffix === undefined || output.suffix === props.suffix),
    }),
}));
