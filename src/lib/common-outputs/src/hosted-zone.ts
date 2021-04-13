import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';
import { enums, optional } from '@aws-accelerator/common-types';

export const HostedZoneType = enums('HostedZoneType', ['PUBLIC', 'PRIVATE']);
export type HostedZoneType = t.TypeOf<typeof HostedZoneType>;

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
  tryFindOneByAccountAndRegionAndType: (props: {
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

  findAllEndpointsByAccountRegionVpcAndType: (props: {
    outputs: StackOutput[];
    accountKey?: string;
    region?: string;
    vpcName?: string;
  }) =>
    finder.findAll({
      outputs: props.outputs,
      predicate: output =>
        (props.accountKey === undefined || output.accountKey === props.accountKey) &&
        (props.region === undefined || output.region === props.region) &&
        (props.vpcName === undefined || output.vpcName === props.vpcName) &&
        output.zoneType === 'PRIVATE' &&
        !!output.serviceName,
    }),

  tryFindOneByAccountRegionVpcAndService: (props: {
    outputs: StackOutput[];
    accountKey?: string;
    region?: string;
    service?: string;
    vpcName?: string;
  }) =>
    finder.findOne({
      outputs: props.outputs,
      predicate: output =>
        (props.accountKey === undefined || output.accountKey === props.accountKey) &&
        (props.region === undefined || output.region === props.region) &&
        (props.service === undefined || output.serviceName === props.service) &&
        (props.vpcName === undefined || output.vpcName === props.vpcName),
    }),
}));
