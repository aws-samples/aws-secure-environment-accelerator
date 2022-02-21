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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import 'jest';
import * as path from 'path';
import * as fs from 'fs';
import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AccountStacks } from '../../src/common/account-stacks';
import { Account } from '../../src/utils/accounts';
import { Limiter } from '../../src/utils/limits';
import { PhaseInput } from '../../src/apps/shared';
import { PhaseInfo } from '../../src/app';
import { Context } from '../../src/utils/context';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';

export async function* deployPhases(phases: PhaseInfo[]): AsyncIterable<cdk.Stage> {
  const input = createPhaseInput();
  for (const phase of phases) {
    const accountStacks = new AccountStacks({
      accounts: input.accounts,
      context: input.context,
      phase: phase.id,
    });
    const runner = await phase.runner();
    await runner({
      ...input,
      accountStacks,
    });
    yield* accountStacks.apps;
  }
}

/**
 * Function that returns mock input for a given phase.
 */
export function createPhaseInput(): Omit<PhaseInput, 'accountStacks'> {
  const accounts: Account[] = [
    {
      key: 'master',
      id: '111111111111',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/111111111111',
      name: 'test+pbmm@amazon.com',
      email: 'test+pbmm@amazon.com',
      ou: 'core',
      type: 'primary',
      inScope: true,
    },
    {
      key: 'log-archive',
      id: '222222222222',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/222222222222',
      name: 'test-logs',
      email: 'test+pbmm-lz-logs@amazon.com',
      ou: 'core',
      type: 'log-archive',
      inScope: true,
    },
    {
      key: 'security',
      id: '333333333333',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/333333333333',
      name: 'test-security',
      email: 'test+pbmm-lz-security@amazon.com',
      ou: 'core',
      type: 'security',
      inScope: true,
    },
    {
      key: 'operations',
      id: '444444444444',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/444444444444',
      name: 'test-operations',
      email: 'test+pbmm-lz-operations@amazon.com',
      ou: 'core',
      inScope: true,
    },
    {
      key: 'shared-network',
      id: '555555555555',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/555555555555',
      name: 'test-shared-network',
      email: 'test+pbmm-lz-shared-network@amazon.com',
      ou: 'core',
      inScope: true,
    },
    {
      key: 'shared-services',
      id: '666666666666',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/666666666666',
      name: 'test-shared-services',
      email: 'test+pbmm-lz-shared-services@amazon.com',
      ou: 'core',
      inScope: true,
    },
    {
      key: 'perimeter',
      id: '777777777777',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/777777777777',
      name: 'test-perimeter',
      email: 'test+pbmm-lz-perimeter@amazon.com',
      ou: 'core',
      inScope: true,
    },
    {
      key: 'fun-acct',
      id: '888888888888',
      arn: 'arn:aws:organizations::888888888888:account/o-111111111111/888888888888',
      name: 'test-fun-act',
      email: 'test+pbmm-fun-act@amazon.com',
      ou: 'core',
      inScope: true,
    },
    {
      key: 'mydevacct1',
      id: '999999999999',
      arn: 'arn:aws:organizations::999999999999:account/o-111111111111/999999999999',
      name: 'test-mydevacct1',
      email: 'test+pbmm-mydevacct1@amazon.com',
      ou: 'core',
      inScope: true,
    },
  ];

  const configFilePath = path.join(__dirname, '..', '..', '..', '..', '..', 'test', 'config.example.json');

  const content = fs.readFileSync(configFilePath);
  const config = AcceleratorConfig.fromString(content.toString());

  const context: Context = {
    acceleratorName: 'PBMM',
    acceleratorPrefix: 'PBMMAccel-',
    acceleratorExecutionRoleName: 'PBMMAccel-PipelineRole',
    acceleratorBaseline: 'ORGANIZATIONS',
    acceleratorPipelineRoleName: 'PBMMAccel-PipelineRole',
    acceleratorStateMachineName: 'PBMMAccel-MainStateMachine_sm',
    configBranch: '',
    configCommitId: '',
    configFilePath: '',
    configRepositoryName: '',
    defaultRegion: 'ca-central-1',
    configRootFilePath: '',
    installerVersion: '0.0.0',
    centralOperationsAccount: 'operations',
    masterAccount: 'master',
    cidrPoolTable: 'cidr-pool',
    subnetCidrPoolAssignedTable: 'cidr-subnet-assign',
    vpcCidrPoolAssignedTable: 'cidr-vpc-assign',
  };

  const limiter = new Limiter([]);
  const outputs: StackOutput[] = [
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'InstanceTimeOutput70915320',
      outputValue: JSON.stringify({
        type: 'InstanceTime',
        value: {
          instanceId: '1',
          time: '1970-01-01T00:00:00',
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'GlobalOptionsDNSResolversGlobalOptionsOutput70915320',
      outputValue: JSON.stringify({
        type: 'GlobalOptionsOutput',
        value: [
          {
            vpcName: 'Endpoint',
            inBound: 'rslvr-in-6ab38d9909954a69a',
            outBound: 'rslvr-out-d87028129a284bbb8',
            rules: {
              onPremRules: ['rslvr-rr-406109823f514c50b', 'rslvr-rr-17abb535405e4bb58'],
              inBoundRule: 'rslvr-rr-2b57c6dc2d914b37b',
            },
          },
        ],
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'GlobalOptionsDNSResolversMadRulesOutputB92B7C64',
      outputValue: JSON.stringify({
        type: 'MadRulesOutput',
        value: { Endpoint: 'rslvr-rr-5586acf6c85244f38' },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'PcxOutputCentralOutput40798179',
      outputValue: JSON.stringify({
        type: 'Pcx',
        value: {
          pcxId: 'pcx-0e5859ebbc1d3f951',
          vpcs: [
            { accountKey: 'shared-network', vpcId: 'vpc-0d0b4cd029857165a', vpcName: 'Central' },
            { accountKey: 'master', vpcId: 'vpc-0d6c94538df842886', vpcName: 'ForSSO' },
          ],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'UnClassVpcOutput7D32BA58',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'shared-network',
          vpcId: 'vpc-0aafbbf8390e61df9',
          vpcName: 'UnClass',
          region: 'ca-central-1',
          cidrBlock: '10.5.0.0/16',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-02a864aa8c921a5ec', subnetName: 'TGW', az: 'a', cidrBlock: '10.5.88.0/27' },
            { subnetId: 'subnet-0ac25d35acc0aaad6', subnetName: 'TGW', az: 'b', cidrBlock: '10.5.88.32/27' },
            { subnetId: 'subnet-0670ca92f1878df12', subnetName: 'Web', az: 'a', cidrBlock: '10.5.32.0/20' },
            { subnetId: 'subnet-0aea65867610ca1e2', subnetName: 'Web', az: 'b', cidrBlock: '10.5.128.0/20' },
            { subnetId: 'subnet-07f6363287f7f47e3', subnetName: 'App', az: 'a', cidrBlock: '10.5.0.0/19' },
            { subnetId: 'subnet-0f3c162bb0424db76', subnetName: 'App', az: 'b', cidrBlock: '10.5.96.0/19' },
            { subnetId: 'subnet-0fdd188eb5a663060', subnetName: 'Data', az: 'a', cidrBlock: '10.5.48.0/20' },
            { subnetId: 'subnet-04e9511b65176575a', subnetName: 'Data', az: 'b', cidrBlock: '10.5.144.0/20' },
            { subnetId: 'subnet-05270e651d6f0117d', subnetName: 'Mgmt', az: 'a', cidrBlock: '10.5.64.0/21' },
            { subnetId: 'subnet-0d0e7907ac786de60', subnetName: 'Mgmt', az: 'b', cidrBlock: '10.5.72.0/21' },
          ],
          routeTables: { UnClassVPC_Common: 'rtb-06708ac88585ff89a' },
          securityGroups: [
            { securityGroupId: 'sg-07f1db44266207f5f', securityGroupName: 'Mgmt' },
            { securityGroupId: 'sg-072406cf4ca2574fd', securityGroupName: 'Web' },
            { securityGroupId: 'sg-0e1cd97fa30598709', securityGroupName: 'App' },
            { securityGroupId: 'sg-0a6c6256362a24445', securityGroupName: 'Data' },
          ],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'TestVpcOutputA3DF90CF',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'shared-network',
          vpcId: 'vpc-00788be23432ad14e',
          vpcName: 'Test',
          region: 'ca-central-1',
          cidrBlock: '10.3.0.0/16',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-040ff3deaa1ebcdc2', subnetName: 'TGW', az: 'a', cidrBlock: '10.3.88.0/27' },
            { subnetId: 'subnet-08996b5322ac7ce94', subnetName: 'TGW', az: 'b', cidrBlock: '10.3.88.32/27' },
            { subnetId: 'subnet-037c84d1093d06e1c', subnetName: 'Web', az: 'a', cidrBlock: '10.3.32.0/20' },
            { subnetId: 'subnet-0046a05971b52e7de', subnetName: 'Web', az: 'b', cidrBlock: '10.3.128.0/20' },
            { subnetId: 'subnet-0605e31822575cae1', subnetName: 'App', az: 'a', cidrBlock: '10.3.0.0/19' },
            { subnetId: 'subnet-0906d75a8647c3f0a', subnetName: 'App', az: 'b', cidrBlock: '10.3.96.0/19' },
            { subnetId: 'subnet-0546f5a64edcd9b1c', subnetName: 'Data', az: 'a', cidrBlock: '10.3.48.0/20' },
            { subnetId: 'subnet-09f71b6a660f3bb14', subnetName: 'Data', az: 'b', cidrBlock: '10.3.144.0/20' },
            { subnetId: 'subnet-0bacba598920e68d7', subnetName: 'Mgmt', az: 'a', cidrBlock: '10.3.64.0/21' },
            { subnetId: 'subnet-039bfe85fb24f300f', subnetName: 'Mgmt', az: 'b', cidrBlock: '10.3.72.0/21' },
          ],
          routeTables: { TestVPC_Common: 'rtb-0e71135b99ef5d6d2' },
          securityGroups: [
            { securityGroupId: 'sg-04f1354477339b766', securityGroupName: 'Mgmt' },
            { securityGroupId: 'sg-08723b81f6792f849', securityGroupName: 'Web' },
            { securityGroupId: 'sg-07221c05df1b9a027', securityGroupName: 'App' },
            { securityGroupId: 'sg-09b8ea3eb9be1f97d', securityGroupName: 'Data' },
          ],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'CentralVpcOutput6FD59021',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'shared-network',
          vpcId: 'vpc-0d0b4cd029857165a',
          vpcName: 'Central',
          region: 'ca-central-1',
          cidrBlock: '10.1.0.0/16',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-06bb47a9733f0aa4d', subnetName: 'TGW', az: 'a', cidrBlock: '10.1.88.0/27' },
            { subnetId: 'subnet-055bf3aa2b3ff91f5', subnetName: 'TGW', az: 'b', cidrBlock: '10.1.88.32/27' },
            { subnetId: 'subnet-0387a84800f5858d5', subnetName: 'Web', az: 'a', cidrBlock: '10.1.32.0/20' },
            { subnetId: 'subnet-075ca0d93563a4d6e', subnetName: 'Web', az: 'b', cidrBlock: '10.1.128.0/20' },
            { subnetId: 'subnet-0b70e3e849949cc0c', subnetName: 'App', az: 'a', cidrBlock: '10.1.0.0/19' },
            { subnetId: 'subnet-04e252c39434bbb19', subnetName: 'App', az: 'b', cidrBlock: '10.1.96.0/19' },
            { subnetId: 'subnet-00bbd856fec06c15b', subnetName: 'Data', az: 'a', cidrBlock: '10.1.48.0/20' },
            { subnetId: 'subnet-0ace127f373a1b274', subnetName: 'Data', az: 'b', cidrBlock: '10.1.144.0/20' },
            { subnetId: 'subnet-05eff632d6af56d17', subnetName: 'Mgmt', az: 'a', cidrBlock: '10.1.64.0/21' },
            { subnetId: 'subnet-03dc090bc09c84439', subnetName: 'Mgmt', az: 'b', cidrBlock: '10.1.72.0/21' },
            { subnetId: 'subnet-02809ab1988c1ec82', subnetName: 'GCWide', az: 'a', cidrBlock: '100.96.252.0/25' },
            { subnetId: 'subnet-0f4514137baa07759', subnetName: 'GCWide', az: 'b', cidrBlock: '100.96.252.128/25' },
          ],
          routeTables: { CentralVPC_Common: 'rtb-0c7e5195ef4963a89', CentralVPC_GCWide: 'rtb-0d5883610b30946fb' },
          securityGroups: [
            { securityGroupId: 'sg-01a539524ced28124', securityGroupName: 'Mgmt' },
            { securityGroupId: 'sg-0a27094b1e756872a', securityGroupName: 'Web' },
            { securityGroupId: 'sg-0909fe73da458f722', securityGroupName: 'App' },
            { securityGroupId: 'sg-075e34e8de4ad427d', securityGroupName: 'Data' },
          ],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'CentralSharingOutputSharedResourcesSubnetsAddTagsToResourcesOutput6C76F064',
      outputValue: JSON.stringify({
        type: 'AddTagsToResources',
        value: [
          {
            resourceId: 'subnet-0387a84800f5858d5',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Web_Central_aza_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-075ca0d93563a4d6e',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Web_Central_azb_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-0b70e3e849949cc0c',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'App_Central_aza_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-04e252c39434bbb19',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'App_Central_azb_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-00bbd856fec06c15b',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Data_Central_aza_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-0ace127f373a1b274',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Data_Central_azb_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-05eff632d6af56d17',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Mgmt_Central_aza_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-03dc090bc09c84439',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Mgmt_Central_azb_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-02809ab1988c1ec82',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'GCWide_Central_aza_net' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'subnet-0f4514137baa07759',
            resourceType: 'subnet',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'GCWide_Central_azb_net' },
            ],
            region: 'ca-central-1',
          },
        ],
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'CentralSharingOutputSharedResourcesVPCAddTagsToResourcesOutput8ADC1D7E',
      outputValue: JSON.stringify({
        type: 'AddTagsToResources',
        value: [
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '555555555555',
            targetAccountIds: ['111111111111'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
            region: 'ca-central-1',
          },
        ],
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'ProdVpcOutput158BE1F6',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'shared-network',
          vpcId: 'vpc-05236b7e563d76ea7',
          vpcName: 'Prod',
          region: 'ca-central-1',
          cidrBlock: '10.4.0.0/16',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-0afcdace47c5b7db3', subnetName: 'TGW', az: 'a', cidrBlock: '10.4.88.0/27' },
            { subnetId: 'subnet-01b8fbfe6db2317a9', subnetName: 'TGW', az: 'b', cidrBlock: '10.4.88.32/27' },
            { subnetId: 'subnet-04426939c9b5f3236', subnetName: 'Web', az: 'a', cidrBlock: '10.4.32.0/20' },
            { subnetId: 'subnet-073546c6f5d2760d0', subnetName: 'Web', az: 'b', cidrBlock: '10.4.128.0/20' },
            { subnetId: 'subnet-09470fb936898df07', subnetName: 'App', az: 'a', cidrBlock: '10.4.0.0/19' },
            { subnetId: 'subnet-013c80789e162679e', subnetName: 'App', az: 'b', cidrBlock: '10.4.96.0/19' },
            { subnetId: 'subnet-0e109f3e9ab2ffaa6', subnetName: 'Data', az: 'a', cidrBlock: '10.4.48.0/20' },
            { subnetId: 'subnet-0dd2202af39185e6e', subnetName: 'Data', az: 'b', cidrBlock: '10.4.144.0/20' },
            { subnetId: 'subnet-099a30042791717a5', subnetName: 'Mgmt', az: 'a', cidrBlock: '10.4.64.0/21' },
            { subnetId: 'subnet-0dd2d47eb36cb02b9', subnetName: 'Mgmt', az: 'b', cidrBlock: '10.4.72.0/21' },
          ],
          routeTables: { ProdVPC_Common: 'rtb-05474e7a19cb9f566' },
          securityGroups: [
            { securityGroupId: 'sg-0b5dcb14939c6aa39', securityGroupName: 'Mgmt' },
            { securityGroupId: 'sg-0404863660bbebd47', securityGroupName: 'Web' },
            { securityGroupId: 'sg-0694906c8ac033f8d', securityGroupName: 'App' },
            { securityGroupId: 'sg-0dd2bb95b3840a35a', securityGroupName: 'Data' },
          ],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'DevVpcOutput116BFECE',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'shared-network',
          vpcId: 'vpc-0ec4a94a0fed0323f',
          vpcName: 'Dev',
          region: 'ca-central-1',
          cidrBlock: '10.2.0.0/16',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-02470384cf1ec8b37', subnetName: 'TGW', az: 'a', cidrBlock: '10.2.88.0/27' },
            { subnetId: 'subnet-04637c048e4b6f18d', subnetName: 'TGW', az: 'b', cidrBlock: '10.2.88.32/27' },
            { subnetId: 'subnet-0db9c0c4b583bca7f', subnetName: 'Web', az: 'a', cidrBlock: '10.2.32.0/20' },
            { subnetId: 'subnet-0d77506f3686d2a30', subnetName: 'Web', az: 'b', cidrBlock: '10.2.128.0/20' },
            { subnetId: 'subnet-0890809620208a6e2', subnetName: 'App', az: 'a', cidrBlock: '10.2.0.0/19' },
            { subnetId: 'subnet-0f74b6dbaf8f66ef6', subnetName: 'App', az: 'b', cidrBlock: '10.2.96.0/19' },
            { subnetId: 'subnet-022ae133c7b3fc734', subnetName: 'Data', az: 'a', cidrBlock: '10.2.48.0/20' },
            { subnetId: 'subnet-0e578d7df827ae4de', subnetName: 'Data', az: 'b', cidrBlock: '10.2.144.0/20' },
            { subnetId: 'subnet-02490c6131a43f7af', subnetName: 'Mgmt', az: 'a', cidrBlock: '10.2.64.0/21' },
            { subnetId: 'subnet-03cd422d557daae88', subnetName: 'Mgmt', az: 'b', cidrBlock: '10.2.72.0/21' },
          ],
          routeTables: { DevVPC_Common: 'rtb-0b00f4686ed9e721f' },
          securityGroups: [
            { securityGroupId: 'sg-012b46d63edc131f7', securityGroupName: 'Mgmt' },
            { securityGroupId: 'sg-0bee27c94d794f655', securityGroupName: 'Web' },
            { securityGroupId: 'sg-0ff9df354ae04e245', securityGroupName: 'App' },
            { securityGroupId: 'sg-0d23e55ee5926d44c', securityGroupName: 'Data' },
          ],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainB9B36144Ref',
      outputValue: 'tgw-03d0ad93aa8d6262c',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwsharedD7F02DB6Ref',
      outputValue: 'tgw-rtb-02bc79504a6da4ea6',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwsegregated1A0E4708Ref',
      outputValue: 'tgw-rtb-0b37d20e343703baf',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwstandalone98B33BB3Ref',
      outputValue: 'tgw-rtb-0c395e05c512363f2',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwcoreF36239ECRef',
      outputValue: 'tgw-rtb-0d470b7d77862a57b',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointEndpointEndpointaza6F9FD084Ref',
      outputValue: 'subnet-0d23fab6faf468e78',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointEndpointEndpointazb30DDC20CRef',
      outputValue: 'subnet-08ce2f607198a4347',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointD8454F05Ref',
      outputValue: 'vpc-0be7520a610121f51',
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'EndpointVpcOutput480C772D',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'shared-network',
          vpcId: 'vpc-0be7520a610121f51',
          vpcName: 'Endpoint',
          region: 'ca-central-1',
          cidrBlock: '10.7.0.0/22',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-0d23fab6faf468e78', subnetName: 'Endpoint', az: 'a', cidrBlock: '10.7.0.0/24' },
            { subnetId: 'subnet-08ce2f607198a4347', subnetName: 'Endpoint', az: 'b', cidrBlock: '10.7.1.0/24' },
          ],
          routeTables: { EndpointVPC_Common: 'rtb-090c43e7562dab577' },
          securityGroups: [],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket',
          bucketName: 'doc-example-bucket',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:555555555555:key/d54a8acb-694c-4fc5-9afe-ca2b263cd0b3',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'FirewallVpnConnectionsOutputBF3C7B46',
      outputValue: JSON.stringify({
        type: 'FirewallVpnConnectionOutput',
        value: [
          {
            firewallName: 'Firewall',
            name: 'Public',
            subnetName: 'Public',
            az: 'a',
            eipIpAddress: '35.182.44.198',
            eipAllocationId: 'eipalloc-0d1b65a5eb09b7761',
            createCustomerGateway: true,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
            customerGatewayId: 'cgw-0f845f38065a3e378',
            vpnConnectionId: 'vpn-052b8e07d2c39bde4',
            vpnTunnelOptions: {
              cgwTunnelInsideAddress1: '169.254.25.46',
              cgwTunnelOutsideAddress1: '35.182.44.198',
              cgwBgpAsn1: '63000',
              vpnTunnelInsideAddress1: '169.254.25.45',
              vpnTunnelOutsideAddress1: '35.182.31.119',
              vpnBgpAsn1: '64512',
              preSharedSecret1: 'yTHR4PMEE7GQJr8dnC4JsIgX9eXMpPUt',
              cgwTunnelInsideAddress2: '169.254.11.2',
              cgwTunnelOutsideAddress2: '3.97.102.213',
              cgwBgpAsn2: '65523',
              vpnTunnelInsideAddress2: '169.254.11.1',
              vpnTunnelOutsideAddress2: '52.60.189.14',
              vpnBgpAsn2: '65521',
              preSharedSecret2: '2ywd00tL_lEQ4fX9aoGBd41oUkjx6v6y',
            },
          },
          {
            firewallName: 'Firewall',
            name: 'OnPremise',
            subnetName: 'OnPremise',
            az: 'a',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            firewallName: 'Firewall',
            name: 'FWMgmt',
            subnetName: 'FWMgmt',
            az: 'a',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            firewallName: 'Firewall',
            name: 'Proxy',
            subnetName: 'Proxy',
            az: 'a',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            firewallName: 'Firewall',
            name: 'Public',
            subnetName: 'Public',
            az: 'b',
            eipIpAddress: '99.79.172.101',
            eipAllocationId: 'eipalloc-0eb4719452b30b4c3',
            createCustomerGateway: true,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
            customerGatewayId: 'cgw-0c35d79a4bcb293ec',
            vpnConnectionId: 'vpn-01a4c23734155dc16',
            vpnTunnelOptions: {
              cgwTunnelInsideAddress1: '169.254.223.190',
              cgwTunnelOutsideAddress1: '99.79.172.101',
              cgwBgpAsn1: '63000',
              vpnTunnelInsideAddress1: '169.254.223.189',
              vpnTunnelOutsideAddress1: '35.182.50.24',
              vpnBgpAsn1: '64512',
              preSharedSecret1: 'T8euLki9G2ERUw0Z2qiFJkG_KFyh5ivW',
              cgwTunnelInsideAddress2: '169.254.150.38',
              cgwTunnelOutsideAddress2: '52.60.163.124',
              cgwBgpAsn2: '65523',
              vpnTunnelInsideAddress2: '169.254.150.37',
              vpnTunnelOutsideAddress2: '52.60.81.195',
              vpnBgpAsn2: '65521',
              preSharedSecret2: '.yPhfn75glcBbwNo4ZuMJ8T973F88gLC',
            },
          },
          {
            firewallName: 'Firewall',
            name: 'OnPremise',
            subnetName: 'OnPremise',
            az: 'b',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            firewallName: 'Firewall',
            name: 'FWMgmt',
            subnetName: 'FWMgmt',
            az: 'b',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            firewallName: 'Firewall',
            name: 'Proxy',
            subnetName: 'Proxy',
            az: 'b',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
        ],
      }),
    },
    {
      accountKey: 'operations',
      region: 'ca-central-1',
      outputKey: 'MadSlrOutputB33780D5',
      outputValue: JSON.stringify({
        type: 'MadAutoScalingRole',
        value: {
          roleArn:
            'arn:aws:iam::111111111111:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling_PBMM',
        },
      }),
    },
    {
      accountKey: 'operations',
      region: 'ca-central-1',
      outputKey: 'LogGroupRoleOutput3A1B7B51',
      outputValue: JSON.stringify({
        type: 'IamRole',
        value: {
          roleName: 'PBMMAccel-Operations-Phas-CustomLogsLogGroup49AC86-IC4E7M6MR366',
          roleArn: 'arn:aws:iam::111111111111:role/PBMMAccel-Operations-Phas-CustomLogsLogGroup49AC86-IC4E7M6MR366',
          roleKey: 'LogGroupRole',
        },
      }),
    },
    {
      accountKey: 'operations',
      region: 'ca-central-1',
      outputKey: 'SecurityGroupOutputCentral0Output0751AD9A',
      outputValue: JSON.stringify({
        type: 'SecurityGroupsOutput',
        value: {
          vpcId: 'vpc-0d0b4cd029857165a',
          vpcName: 'Central',
          securityGroupIds: [
            { securityGroupId: 'sg-0affc8ea940417638', securityGroupName: 'Mgmt' },
            { securityGroupId: 'sg-0c91bf1bc94e5797f', securityGroupName: 'Web' },
            { securityGroupId: 'sg-08f5b682020bf1c61', securityGroupName: 'App' },
            { securityGroupId: 'sg-041abd65f62750b6e', securityGroupName: 'Data' },
          ],
        },
      }),
    },
    {
      accountKey: 'operations',
      region: 'ca-central-1',
      outputKey: 'OutputSharedResourcesCentralShared0AddTagsToResourcesOutputA46EA520',
      outputValue: JSON.stringify({
        type: 'AddTagsToResources',
        value: [
          {
            resourceId: 'sg-0affc8ea940417638',
            resourceType: 'security-group',
            targetAccountIds: ['555555555555'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Mgmt_sg' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'sg-0c91bf1bc94e5797f',
            resourceType: 'security-group',
            targetAccountIds: ['555555555555'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Web_sg' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'sg-08f5b682020bf1c61',
            resourceType: 'security-group',
            targetAccountIds: ['555555555555'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'App_sg' },
            ],
            region: 'ca-central-1',
          },
          {
            resourceId: 'sg-041abd65f62750b6e',
            resourceType: 'security-group',
            targetAccountIds: ['555555555555'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Data_sg' },
            ],
            region: 'ca-central-1',
          },
        ],
      }),
    },
    {
      accountKey: 'operations',
      region: 'ca-central-1',
      outputKey: 'MadOutputED7A3DFD',
      outputValue: JSON.stringify({
        type: 'MadOutput',
        value: {
          id: 1001,
          vpcName: 'Central',
          directoryId: 'd-9d672434ad',
          dnsIps: '100.96.252.103,100.96.252.233',
          passwordArn: 'arn:aws:secretsmanager:ca-central-1:111111111111:secret:PBMMAccel/operations/mad/password',
        },
      }),
    },
    {
      accountKey: 'operations',
      region: 'ca-central-1',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket1',
          bucketName: 'doc-example-bucket1',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:111111111111:key/4e0a5d05-a3ba-4b19-b60e-5f26631d874a',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'PerimeterPhase1VpcStackPerimeterPublicPerimeteraza0AC836E9Ref',
      outputValue: 'subnet-074afd4fc157a36d3',
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'PerimeterPhase1VpcStackPerimeterAD7AA8ABRef',
      outputValue: 'vpc-008309eb2954c138b',
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'PerimeterVpcOutput17588A8B',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'perimeter',
          vpcId: 'vpc-008309eb2954c138b',
          vpcName: 'Perimeter',
          region: 'ca-central-1',
          cidrBlock: '10.7.4.0/22',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-074afd4fc157a36d3', subnetName: 'Public', az: 'a', cidrBlock: '100.96.250.0/26' },
            { subnetId: 'subnet-0919b680c624cda7a', subnetName: 'Public', az: 'b', cidrBlock: '100.96.250.128/26' },
            { subnetId: 'subnet-052d9c1787cc451df', subnetName: 'FWMgmt', az: 'a', cidrBlock: '100.96.251.32/27' },
            { subnetId: 'subnet-001239090ca287b94', subnetName: 'FWMgmt', az: 'b', cidrBlock: '100.96.251.160/27' },
            { subnetId: 'subnet-074c58bdde90265f3', subnetName: 'Proxy', az: 'a', cidrBlock: '100.96.251.64/26' },
            { subnetId: 'subnet-064c1ac74779f8ecb', subnetName: 'Proxy', az: 'b', cidrBlock: '100.96.251.192/26' },
            { subnetId: 'subnet-05bbb12ea281f2c24', subnetName: 'OnPremise', az: 'a', cidrBlock: '100.96.250.64/26' },
            { subnetId: 'subnet-050d0cafb42104fbe', subnetName: 'OnPremise', az: 'b', cidrBlock: '100.96.250.192/26' },
            { subnetId: 'subnet-0fb010dd0735d5d17', subnetName: 'Detonation', az: 'a', cidrBlock: '10.7.4.0/24' },
            { subnetId: 'subnet-01cc2e0ae8555005b', subnetName: 'Detonation', az: 'b', cidrBlock: '10.7.5.0/24' },
          ],
          routeTables: {
            OnPremise_Shared: 'rtb-0e765603c98b5f0e1',
            Public_Shared: 'rtb-03c49c6f93459fb48',
            FWMgmt_azA: 'rtb-0497eefe45a7a851e',
            FWMgmt_azB: 'rtb-0f8652903abeb0068',
            Proxy_azA: 'rtb-077ebe27c94c41654',
            Proxy_azB: 'rtb-00952886f914eb856',
            Detonation_Shared: 'rtb-0ee122b1b0669f439',
          },
          securityGroups: [
            { securityGroupId: 'sg-06e305933a4bbd75a', securityGroupName: 'Public-Prod-ALB' },
            { securityGroupId: 'sg-0e1d7c2ce7350c63e', securityGroupName: 'Public-DevTest-ALB' },
            { securityGroupId: 'sg-03d7fd5e7ead15cdf', securityGroupName: 'FirewallMgr' },
            { securityGroupId: 'sg-0eac52bf396a4226b', securityGroupName: 'Firewalls' },
          ],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'PerimeterPhase1VpcStackPerimeterProxyPerimeterazaCA836246Ref',
      outputValue: 'subnet-074c58bdde90265f3',
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'PerimeterPhase1VpcStackPerimeterProxyPerimeterazb3D9DF31DRef',
      outputValue: 'subnet-064c1ac74779f8ecb',
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket2',
          bucketName: 'doc-example-bucket2',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:777777777777:key/ccff8373-96f9-4ced-a167-38476316b235',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'FirewallSubscriptionsOutputperimeterOutputE06E54FF',
      outputValue: JSON.stringify({
        type: 'AmiSubscriptionStatus',
        value: { imageId: 'ami-047aac44951feb9fb', status: 'Subscribed' },
      }),
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'FirewallManagerSubscriptionsOutputperimeterOutputA4CD3A94',
      outputValue: JSON.stringify({
        type: 'AmiSubscriptionStatus',
        value: { imageId: 'ami-06fa2a9e6f8fae9f2', status: 'Subscribed' },
      }),
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'FirewallPortOutput78ED81D4',
      outputValue: JSON.stringify({
        type: 'FirewallPortOutput',
        value: [
          {
            name: 'Public',
            subnetName: 'Public',
            az: 'a',
            eipIpAddress: '35.182.44.198',
            eipAllocationId: 'eipalloc-0d1b65a5eb09b7761',
            createCustomerGateway: true,
          },
          { name: 'OnPremise', subnetName: 'OnPremise', az: 'a', createCustomerGateway: false },
          { name: 'FWMgmt', subnetName: 'FWMgmt', az: 'a', createCustomerGateway: false },
          { name: 'Proxy', subnetName: 'Proxy', az: 'a', createCustomerGateway: false },
          {
            name: 'Public',
            subnetName: 'Public',
            az: 'b',
            eipIpAddress: '99.79.172.101',
            eipAllocationId: 'eipalloc-0eb4719452b30b4c3',
            createCustomerGateway: true,
          },
          { name: 'OnPremise', subnetName: 'OnPremise', az: 'b', createCustomerGateway: false },
          { name: 'FWMgmt', subnetName: 'FWMgmt', az: 'b', createCustomerGateway: false },
          { name: 'Proxy', subnetName: 'Proxy', az: 'b', createCustomerGateway: false },
        ],
      }),
    },
    {
      accountKey: 'master',
      region: 'ca-central-1',
      outputKey: 'ForSSOVpcOutputA52A9D36',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'master',
          vpcId: 'vpc-0d6c94538df842886',
          vpcName: 'ForSSO',
          region: 'ca-central-1',
          cidrBlock: '10.249.1.0/24',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-0663975f1bac6383a', subnetName: 'ForSSO', az: 'a', cidrBlock: '10.249.1.0/27' },
            { subnetId: 'subnet-0e9ef996895c4c674', subnetName: 'ForSSO', az: 'b', cidrBlock: '10.249.1.32/27' },
          ],
          routeTables: { ForSSO_Shared: 'rtb-0b3446d9ba6f8d031' },
          securityGroups: [],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'master',
      region: 'ca-central-1',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket3',
          bucketName: 'doc-example-bucket3',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:111111111111:key/e147a41e-7ada-427f-9b6b-75cdd706e313',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'master',
      region: 'ca-central-1',
      outputKey: 'IamPolicyArtifactsOutputmasterOutput0A80EBB8',
      outputValue: JSON.stringify({
        type: 'IamPolicyArtifactsOutput',
        value: {
          accountKey: 'master',
          bucketArn: 'arn:aws:s3:::doc-example-bucket',
          bucketName: 'doc-example-bucket',
          keyPrefix: 'iam-policy',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'master',
      region: 'ca-central-1',
      outputKey: 'CentralBucketOutputBAF8A406',
      outputValue: JSON.stringify({
        type: 'CentralBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket',
          bucketName: 'doc-example-bucket',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:111111111111:key/c94a571b-25da-44a1-ac85-366d333ffb2a',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'master',
      region: 'ca-central-1',
      outputKey: 'RdgwArtifactsOutputmasterOutputF3DB137F',
      outputValue: JSON.stringify({
        type: 'RdgwArtifactsOutput',
        value: {
          accountKey: 'master',
          bucketArn: 'arn:aws:s3:::doc-example-bucket',
          bucketName: 'doc-example-bucket',
          keyPrefix: 'config/scripts/',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'log-archive',
      region: 'ca-central-1',
      outputKey: 'LogBucketOutput9005E9C6',
      outputValue: JSON.stringify({
        type: 'LogBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket1',
          bucketName: 'doc-example-bucket1',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:222222222222:key/18f7a4af-2fbb-4a4f-a597-7b0bae016c36',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'log-archive',
      region: 'ca-central-1',
      outputKey: 'AesLogBucketOutput0333D00E',
      outputValue: JSON.stringify({
        type: 'AesBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket1',
          bucketName: 'doc-example-bucket1',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'security',
      region: 'ca-central-1',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket2',
          bucketName: 'doc-example-bucket2',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:333333333333:key/ba5d50a0-e25d-4d7e-b15e-bad6d4054310',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'shared-services',
      region: 'ca-central-1',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket3',
          bucketName: 'doc-example-bucket3',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:666666666666:key/f6c1ec02-e1cb-4ace-8abf-25574551cf32',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'fun-acct',
      region: 'ca-central-1',
      outputKey: 'SandboxVpcOutput323ACFBC',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          accountKey: 'fun-acct',
          vpcId: 'vpc-02bcf75f21ece6cc7',
          vpcName: 'Sandbox',
          region: 'ca-central-1',
          cidrBlock: '10.6.0.0/16',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-0a9f3ea3534976522', subnetName: 'Web', az: 'a', cidrBlock: '10.6.32.0/20' },
            { subnetId: 'subnet-095b350da47024ef2', subnetName: 'Web', az: 'b', cidrBlock: '10.6.128.0/20' },
            { subnetId: 'subnet-046ea3102f023bb0d', subnetName: 'App', az: 'a', cidrBlock: '10.6.0.0/19' },
            { subnetId: 'subnet-069876defa066f33d', subnetName: 'App', az: 'b', cidrBlock: '10.6.96.0/19' },
            { subnetId: 'subnet-053d70473813bdceb', subnetName: 'Data', az: 'a', cidrBlock: '10.6.48.0/20' },
            { subnetId: 'subnet-0b371408628f4f5ff', subnetName: 'Data', az: 'b', cidrBlock: '10.6.144.0/20' },
            { subnetId: 'subnet-01b54c69041df74bf', subnetName: 'Mgmt', az: 'a', cidrBlock: '10.6.64.0/21' },
            { subnetId: 'subnet-0d142b91aa2483660', subnetName: 'Mgmt', az: 'b', cidrBlock: '10.6.72.0/21' },
          ],
          routeTables: { SandboxVPC_IGW: 'rtb-0a3bd2c7cd8b1da77', SandboxVPC_Common: 'rtb-062cfa945fcae57b9' },
          securityGroups: [
            { securityGroupId: 'sg-00d85a468183080e8', securityGroupName: 'Mgmt' },
            { securityGroupId: 'sg-0524125aed8270f47', securityGroupName: 'Web' },
            { securityGroupId: 'sg-0e8edb27feb5b381e', securityGroupName: 'App' },
            { securityGroupId: 'sg-0825ba34c4ed50be2', securityGroupName: 'Data' },
          ],
          tgwAttachments: [{ name: 'Main', id: 'tgw-attach-05c273a9a6c58b8e5' }],
        },
      }),
    },
    {
      accountKey: 'fun-acct',
      region: 'ca-central-1',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::doc-example-bucket3',
          bucketName: 'doc-example-bucket3',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:888888888888:key/7592bb9b-43d1-45d3-be51-bbc59cb06471',
          region: 'ca-central-1',
          encryptionKeyName: 'EncryptionKey',
          encryptionKeyId: 'XXXXXXXXXXXXXXXXX',
        },
      }),
    },
    {
      accountKey: 'master',
      region: 'ca-central-1',
      outputKey: 'SCPArtifactsOutputmasterSOutputA1DE17D3',
      outputValue: JSON.stringify({
        type: 'ArtifactOutput',
        value: {
          accountKey: 'master',
          artifactName: 'SCP',
          bucketArn: 'arn:aws:s3:::doc-example-bucket',
          bucketName: 'doc-example-bucket',
          keyPrefix: 'scp',
        },
      }),
    },
    {
      accountKey: 'shared-network',
      region: 'ca-central-1',
      outputKey: 'TgwMainOutput80DC0D9F',
      outputValue: JSON.stringify({
        type: 'TgwOutput',
        value: {
          accountKey: 'shared-network',
          region: 'ca-central-1',
          name: 'Main',
          tgwId: 'tgw-0b2b7f1fa32b2626d',
          tgwRouteTableNameToIdMap: {
            core: 'tgw-rtb-050a0b568ac22966f',
            segregated: 'tgw-rtb-030932a641b59972e',
            shared: 'tgw-rtb-04b332872ff47ee6e',
            standalone: 'tgw-rtb-0130a86d5143eed2f',
          },
        },
      }),
    },
    {
      accountKey: 'perimeter',
      region: 'ca-central-1',
      outputKey: 'FirewallPortOutputFirewallC2Output2A85E265',
      outputValue: JSON.stringify({
        type: 'FirewallPortOutput',
        value: [
          {
            firewallName: 'Firewall',
            name: 'Public',
            subnetName: 'Public',
            az: 'a',
            eipIpAddress: '99.79.11.13',
            eipAllocationId: 'eipalloc-09f9773bae67646e1',
            createCustomerGateway: true,
          },
          {
            firewallName: 'Firewall',
            name: 'Public',
            subnetName: 'Public',
            az: 'b',
            eipIpAddress: '99.79.103.253',
            eipAllocationId: 'eipalloc-00b051fd7ee978eb9',
            createCustomerGateway: true,
          },
        ],
      }),
    },
  ];

  const organizations: OrganizationalUnit[] = [
    {
      ouId: 'ou-core',
      ouArn: 'arn:aws:organizations::111111111111:ou/o-test/ou-core',
      ouName: 'Core',
      ouPath: 'Core',
      rootOrgId: 'o-test',
    },
    {
      ouId: 'ou-test',
      ouArn: 'arn:aws:organizations::111111111111:ou/o-test/ou-test',
      ouName: 'Test',
      ouPath: 'Test',
      rootOrgId: 'o-test',
    },
  ];

  return {
    acceleratorConfig: config,
    accounts,
    context,
    limiter,
    outputs,
    organizations,
  };
}
