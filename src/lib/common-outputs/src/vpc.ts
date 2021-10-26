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
import { defaulted, optional } from '@aws-accelerator/common-types';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export interface VpcSecurityGroupOutput {
  securityGroupId: string;
  securityGroupName: string;
}

export interface SecurityGroupsOutput {
  vpcId: string;
  vpcName: string;
  securityGroupIds: VpcSecurityGroupOutput[];
}

export interface SharedSecurityGroupIndexOutput {
  vpcName: string;
  index: number;
}

export const VpcSubnetOutput = t.interface({
  subnetId: t.string,
  subnetName: t.string,
  az: t.string,
  cidrBlock: t.string,
});

export const TgwAttachmentOutput = t.interface({
  name: t.string,
  id: t.string,
});

// export const VpcRouteTableOutput = t.interface({
//   routeTableId: t.string,
//   routeTableName: t.string,
// });

export const VpcSecurityGroupOutput = t.interface({
  securityGroupId: t.string,
  securityGroupName: t.string,
});

export const NfwOutput = t.interface({
  az: t.string,
  vpcEndpoint: t.string,
  subnets: t.array(VpcSubnetOutput),
});

export const VpcOutput = t.interface(
  {
    accountKey: t.string,
    vpcId: t.string,
    vpcName: t.string,
    region: t.string,
    cidrBlock: t.string,
    additionalCidrBlocks: t.array(t.string),
    subnets: t.array(VpcSubnetOutput),
    // routeTables: t.array(VpcRouteTableOutput),
    routeTables: t.record(t.string, t.string),
    securityGroups: t.array(VpcSecurityGroupOutput),
    tgwAttachments: t.array(TgwAttachmentOutput),
    initialSubnets: defaulted(t.array(VpcSubnetOutput), []),
    nfw: optional(t.array(NfwOutput)),
  },
  'VpcOutput',
);

export type VpcOutput = t.TypeOf<typeof VpcOutput>;
export type VpcSubnetOutput = t.TypeOf<typeof VpcSubnetOutput>;

export const VpcOutputFinder = createStructuredOutputFinder(VpcOutput, finder => ({
  tryFindOneByAccountAndRegionAndName: (props: {
    outputs: StackOutput[];
    vpcName?: string;
    accountKey?: string;
    region?: string;
  }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      predicate: output =>
        (props.accountKey === undefined || output.accountKey === props.accountKey) &&
        (props.region === undefined || output.region === props.region) &&
        (props.vpcName === undefined || output.vpcName === props.vpcName),
    }),
}));
