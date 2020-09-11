import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';
import { enumType, optional } from '@aws-accelerator/common-types';

export const HOSTEDZONE = ['PUBLIC', 'PRIVATE'] as const;

export const HostedZoneType = enumType<typeof HOSTEDZONE[number]>(HOSTEDZONE, 'HostedZoneType');

export const HostedZoneOutput = t.interface(
  {
    accountKey: t.string,
    region: t.string,
    hostedZoneId: t.string,
    domain: t.string,
    zoneType: HostedZoneType,
    serviceName: optional(t.string),
    vpcName: optional(t.string),
  },
  'HostedZoneOutput',
);

export type HostedZoneOutput = t.TypeOf<typeof HostedZoneOutput>;

export const HostedZoneOutputFinder = createStructuredOutputFinder(HostedZoneOutput, finder => ({
  tryFindOneByAccountAndRegionAndName: (props: {
    outputs: StackOutput[];
    accountKey?: string;
    region?: string;
    zoneType?: string;
  }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      predicate: output =>
        (props.accountKey === undefined || output.accountKey === props.accountKey) &&
        (props.region === undefined || output.region === props.region) &&
        (props.zoneType === undefined || output.zoneType === props.zoneType),
    }),
}));
