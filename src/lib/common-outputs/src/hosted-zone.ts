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
