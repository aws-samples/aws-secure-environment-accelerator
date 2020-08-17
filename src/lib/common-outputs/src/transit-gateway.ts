import * as t from 'io-ts';
import { StackOutput } from './stack-output';
import { createStructuredOutputFinder } from './structured-output';

export const TransitGatewayOutput = t.interface(
  {
    accountKey: t.string,
    region: t.string,
    name: t.string,
    tgwId: t.string,
    tgwRouteTableNameToIdMap: t.record(t.string, t.string),
  },
  'TgwOutput',
);

export type TransitGatewayOutput = t.TypeOf<typeof TransitGatewayOutput>;

export const TransitGatewayOutputFinder = createStructuredOutputFinder(TransitGatewayOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey?: string; name: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.name === props.name,
    }),
}));

export const TransitGatewayAttachmentOutput = t.interface(
  {
    accountKey: t.string,
    region: t.string,
    tgwAttachmentId: t.string,
    tgwRouteAssociates: t.array(t.string),
    tgwRoutePropagates: t.array(t.string),
    blackhole: t.boolean,
    cidr: t.string,
  },
  'TgwAttachmentOutput',
);

export type TransitGatewayAttachmentOutput = t.TypeOf<typeof TransitGatewayAttachmentOutput>;

export const TransitGatewayAttachmentOutputFinder = createStructuredOutputFinder(
  TransitGatewayAttachmentOutput,
  () => ({}),
);
