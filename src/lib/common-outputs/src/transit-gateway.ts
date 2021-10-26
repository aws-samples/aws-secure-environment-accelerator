/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { optional } from '@aws-accelerator/common-types';
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
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey?: string; name: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
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
    vpc: optional(t.string),
    constructIndex: optional(t.string),
  },
  'TgwAttachmentOutput',
);

export type TransitGatewayAttachmentOutput = t.TypeOf<typeof TransitGatewayAttachmentOutput>;

export const TransitGatewayAttachmentOutputFinder = createStructuredOutputFinder(
  TransitGatewayAttachmentOutput,
  () => ({}),
);

export const TransitGatewayPeeringAttachmentOutput = t.interface(
  {
    tgwAttachmentId: t.string,
    tagValue: t.string,
    sourceTgw: t.string,
    tgws: t.array(
      t.interface({
        name: t.string,
        accountKey: t.string,
        region: t.string,
        tgwId: t.string,
      }),
    ),
  },
  'TgwPeeringAttachmentOutput',
);

export type TransitGatewayPeeringAttachmentOutput = t.TypeOf<typeof TransitGatewayPeeringAttachmentOutput>;

export const TransitGatewayPeeringAttachmentOutputFinder = createStructuredOutputFinder(
  TransitGatewayPeeringAttachmentOutput,
  () => ({}),
);
