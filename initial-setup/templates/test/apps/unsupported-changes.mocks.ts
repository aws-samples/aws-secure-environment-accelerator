// tslint:disable:no-any
import 'jest';
import * as fs from 'fs';
import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AccountStacks } from '../../src/common/account-stacks';
import { Account } from '../../src/utils/accounts';
import { Limiter } from '../../src/utils/limits';
import { PhaseInput } from '../../src/apps/shared';
import { PhaseInfo } from '../../src/app';
import { Context } from '../../src/utils/context';

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
    },
    {
      key: 'log-archive',
      id: '222222222222',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/222222222222',
      name: 'test-logs',
      email: 'test+pbmm-lz-logs@amazon.com',
      ou: 'core',
      type: 'log-archive',
    },
    {
      key: 'security',
      id: '333333333333',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/333333333333',
      name: 'test-security',
      email: 'test+pbmm-lz-security@amazon.com',
      ou: 'core',
      type: 'security',
    },
    {
      key: 'operations',
      id: '444444444444',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/444444444444',
      name: 'test-operations',
      email: 'test+pbmm-lz-operations@amazon.com',
      ou: 'core',
    },
    {
      key: 'shared-network',
      id: '555555555555',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/555555555555',
      name: 'test-shared-network',
      email: 'test+pbmm-lz-shared-network@amazon.com',
      ou: 'core',
    },
    {
      key: 'shared-services',
      id: '666666666666',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/666666666666',
      name: 'test-shared-services',
      email: 'test+pbmm-lz-shared-services@amazon.com',
      ou: 'core',
    },
    {
      key: 'perimeter',
      id: '777777777777',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/777777777777',
      name: 'test-perimeter',
      email: 'test+pbmm-lz-perimeter@amazon.com',
      ou: 'core',
    },
    {
      key: 'fun-acct',
      id: '888888888888',
      arn: 'arn:aws:organizations::888888888888:account/o-111111111111/888888888888',
      name: 'test-fun-act',
      email: 'test+pbmm-fun-act@amazon.com',
      ou: 'core',
    },
    {
      key: 'mydevacct1',
      id: '999999999999',
      arn: 'arn:aws:organizations::999999999999:account/o-111111111111/999999999999',
      name: 'test-mydevacct1',
      email: 'test+pbmm-mydevacct1@amazon.com',
      ou: 'core',
    },
  ];

  const content = fs.readFileSync('../../config.example.json');
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
  };

  const limiter = new Limiter([]);
  const outputs: StackOutput[] = [
    {
      accountKey: 'perimeter',
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
      outputKey: 'GlobalOptionsDNSResolversMadRulesOutputB92B7C64',
      outputValue: JSON.stringify({
        type: 'MadRulesOutput',
        value: { Endpoint: 'rslvr-rr-5586acf6c85244f38' },
      }),
    },
    {
      accountKey: 'shared-network',
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
      outputKey: 'UnClassVpcOutput7D32BA58',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-0aafbbf8390e61df9',
          vpcName: 'UnClass',
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
        },
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'TestVpcOutputA3DF90CF',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-00788be23432ad14e',
          vpcName: 'Test',
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
        },
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'CentralVpcOutput6FD59021',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-0d0b4cd029857165a',
          vpcName: 'Central',
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
        },
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'CentralSharingOutputSharedResourcesSubnetsAddTagsToResourcesOutput6C76F064',
      outputValue: JSON.stringify({
        type: 'AddTagsToResources',
        value: [
          {
            resourceId: 'subnet-0387a84800f5858d5',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Web_Central_aza_net' },
            ],
          },
          {
            resourceId: 'subnet-075ca0d93563a4d6e',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Web_Central_azb_net' },
            ],
          },
          {
            resourceId: 'subnet-0b70e3e849949cc0c',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'App_Central_aza_net' },
            ],
          },
          {
            resourceId: 'subnet-04e252c39434bbb19',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'App_Central_azb_net' },
            ],
          },
          {
            resourceId: 'subnet-00bbd856fec06c15b',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Data_Central_aza_net' },
            ],
          },
          {
            resourceId: 'subnet-0ace127f373a1b274',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Data_Central_azb_net' },
            ],
          },
          {
            resourceId: 'subnet-05eff632d6af56d17',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Mgmt_Central_aza_net' },
            ],
          },
          {
            resourceId: 'subnet-03dc090bc09c84439',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Mgmt_Central_azb_net' },
            ],
          },
          {
            resourceId: 'subnet-02809ab1988c1ec82',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'GCWide_Central_aza_net' },
            ],
          },
          {
            resourceId: 'subnet-0f4514137baa07759',
            resourceType: 'subnet',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'GCWide_Central_azb_net' },
            ],
          },
        ],
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'CentralSharingOutputSharedResourcesVPCAddTagsToResourcesOutput8ADC1D7E',
      outputValue: JSON.stringify({
        type: 'AddTagsToResources',
        value: [
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
          {
            resourceId: 'vpc-0d0b4cd029857165a',
            resourceType: 'vpc',
            sourceAccountId: '007307298200',
            targetAccountIds: ['278816265654'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Central_vpc' },
            ],
          },
        ],
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'ProdVpcOutput158BE1F6',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-05236b7e563d76ea7',
          vpcName: 'Prod',
          cidrBlock: '10.4.0.0/16',
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
        },
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'DevVpcOutput116BFECE',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-0ec4a94a0fed0323f',
          vpcName: 'Dev',
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
        },
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainB9B36144Ref',
      outputValue: 'tgw-03d0ad93aa8d6262c',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwsharedD7F02DB6Ref',
      outputValue: 'tgw-rtb-02bc79504a6da4ea6',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwsegregated1A0E4708Ref',
      outputValue: 'tgw-rtb-0b37d20e343703baf',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwstandalone98B33BB3Ref',
      outputValue: 'tgw-rtb-0c395e05c512363f2',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointMainMaintgwcoreF36239ECRef',
      outputValue: 'tgw-rtb-0d470b7d77862a57b',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointEndpointEndpointaza6F9FD084Ref',
      outputValue: 'subnet-0d23fab6faf468e78',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointEndpointEndpointazb30DDC20CRef',
      outputValue: 'subnet-08ce2f607198a4347',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'SharedNetworkPhase1VpcStackEndpointD8454F05Ref',
      outputValue: 'vpc-0be7520a610121f51',
    },
    {
      accountKey: 'shared-network',
      outputKey: 'EndpointVpcOutput480C772D',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-0be7520a610121f51',
          vpcName: 'Endpoint',
          cidrBlock: '10.7.0.0/22',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-0d23fab6faf468e78', subnetName: 'Endpoint', az: 'a', cidrBlock: '10.7.0.0/24' },
            { subnetId: 'subnet-08ce2f607198a4347', subnetName: 'Endpoint', az: 'b', cidrBlock: '10.7.1.0/24' },
          ],
          routeTables: { EndpointVPC_Common: 'rtb-090c43e7562dab577' },
          securityGroups: [],
        },
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-sharednetwork-phase1-cacentral1-18vq0emthri3h',
          bucketName: 'pbmmaccel-sharednetwork-phase1-cacentral1-18vq0emthri3h',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:007307298200:key/d54a8acb-694c-4fc5-9afe-ca2b263cd0b3',
        },
      }),
    },
    {
      accountKey: 'shared-network',
      outputKey: 'FirewallVpnConnectionsOutputBF3C7B46',
      outputValue: JSON.stringify({
        type: 'FirewallVpnConnectionOutput',
        value: [
          {
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
            },
          },
          {
            name: 'OnPremise',
            subnetName: 'OnPremise',
            az: 'a',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            name: 'FWMgmt',
            subnetName: 'FWMgmt',
            az: 'a',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            name: 'Proxy',
            subnetName: 'Proxy',
            az: 'a',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
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
            },
          },
          {
            name: 'OnPremise',
            subnetName: 'OnPremise',
            az: 'b',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
            name: 'FWMgmt',
            subnetName: 'FWMgmt',
            az: 'b',
            createCustomerGateway: false,
            firewallAccountKey: 'perimeter',
            transitGatewayId: 'tgw-03d0ad93aa8d6262c',
          },
          {
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
      outputKey: 'MadSlrOutputB33780D5',
      outputValue: JSON.stringify({
        type: 'MadAutoScalingRole',
        value: {
          roleArn:
            'arn:aws:iam::278816265654:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling_PBMM',
        },
      }),
    },
    {
      accountKey: 'operations',
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
      outputKey: 'OutputSharedResourcesCentralShared0AddTagsToResourcesOutputA46EA520',
      outputValue: JSON.stringify({
        type: 'AddTagsToResources',
        value: [
          {
            resourceId: 'sg-0affc8ea940417638',
            resourceType: 'security-group',
            targetAccountIds: ['007307298200'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Mgmt_sg' },
            ],
          },
          {
            resourceId: 'sg-0c91bf1bc94e5797f',
            resourceType: 'security-group',
            targetAccountIds: ['007307298200'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Web_sg' },
            ],
          },
          {
            resourceId: 'sg-08f5b682020bf1c61',
            resourceType: 'security-group',
            targetAccountIds: ['007307298200'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'App_sg' },
            ],
          },
          {
            resourceId: 'sg-041abd65f62750b6e',
            resourceType: 'security-group',
            targetAccountIds: ['007307298200'],
            tags: [
              { key: 'Accelerator', value: 'PBMM' },
              { key: 'Name', value: 'Data_sg' },
            ],
          },
        ],
      }),
    },
    {
      accountKey: 'operations',
      outputKey: 'MadOutputED7A3DFD',
      outputValue: JSON.stringify({
        type: 'MadOutput',
        value: {
          id: 1001,
          vpcName: 'Central',
          directoryId: 'd-9d672434ad',
          dnsIps: '100.96.252.103,100.96.252.233',
          passwordArn: 'arn:aws:secretsmanager:ca-central-1:687384172140:secret:PBMMAccel/operations/mad/password',
        },
      }),
    },
    {
      accountKey: 'operations',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-operations-phase1-cacentral1-qwupe8qc06ka',
          bucketName: 'pbmmaccel-operations-phase1-cacentral1-qwupe8qc06ka',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:278816265654:key/4e0a5d05-a3ba-4b19-b60e-5f26631d874a',
        },
      }),
    },
    {
      accountKey: 'perimeter',
      outputKey: 'PerimeterPhase1VpcStackPerimeterPublicPerimeteraza0AC836E9Ref',
      outputValue: 'subnet-074afd4fc157a36d3',
    },
    {
      accountKey: 'perimeter',
      outputKey: 'PerimeterPhase1VpcStackPerimeterAD7AA8ABRef',
      outputValue: 'vpc-008309eb2954c138b',
    },
    {
      accountKey: 'perimeter',
      outputKey: 'PerimeterVpcOutput17588A8B',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-008309eb2954c138b',
          vpcName: 'Perimeter',
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
        },
      }),
    },
    {
      accountKey: 'perimeter',
      outputKey: 'PerimeterPhase1VpcStackPerimeterProxyPerimeterazaCA836246Ref',
      outputValue: 'subnet-074c58bdde90265f3',
    },
    {
      accountKey: 'perimeter',
      outputKey: 'PerimeterPhase1VpcStackPerimeterProxyPerimeterazb3D9DF31DRef',
      outputValue: 'subnet-064c1ac74779f8ecb',
    },
    {
      accountKey: 'perimeter',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-perimeter-phase1-cacentral1-kfs7sxfgn49u',
          bucketName: 'pbmmaccel-perimeter-phase1-cacentral1-kfs7sxfgn49u',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:422986242298:key/ccff8373-96f9-4ced-a167-38476316b235',
        },
      }),
    },
    {
      accountKey: 'perimeter',
      outputKey: 'FirewallSubscriptionsOutputperimeterOutputE06E54FF',
      outputValue: JSON.stringify({
        type: 'AmiSubscriptionStatus',
        value: { imageId: 'ami-047aac44951feb9fb', status: 'Subscribed' },
      }),
    },
    {
      accountKey: 'perimeter',
      outputKey: 'FirewallManagerSubscriptionsOutputperimeterOutputA4CD3A94',
      outputValue: JSON.stringify({
        type: 'AmiSubscriptionStatus',
        value: { imageId: 'ami-06fa2a9e6f8fae9f2', status: 'Subscribed' },
      }),
    },
    {
      accountKey: 'perimeter',
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
      outputKey: 'ForSSOVpcOutputA52A9D36',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-0d6c94538df842886',
          vpcName: 'ForSSO',
          cidrBlock: '10.249.1.0/24',
          additionalCidrBlocks: [],
          subnets: [
            { subnetId: 'subnet-0663975f1bac6383a', subnetName: 'ForSSO', az: 'a', cidrBlock: '10.249.1.0/27' },
            { subnetId: 'subnet-0e9ef996895c4c674', subnetName: 'ForSSO', az: 'b', cidrBlock: '10.249.1.32/27' },
          ],
          routeTables: { ForSSO_Shared: 'rtb-0b3446d9ba6f8d031' },
          securityGroups: [],
        },
      }),
    },
    {
      accountKey: 'master',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-master-phase1-cacentral1-o4irpt8n8i3p',
          bucketName: 'pbmmaccel-master-phase1-cacentral1-o4irpt8n8i3p',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:687384172140:key/e147a41e-7ada-427f-9b6b-75cdd706e313',
        },
      }),
    },
    {
      accountKey: 'master',
      outputKey: 'IamPolicyArtifactsOutputmasterOutput0A80EBB8',
      outputValue: JSON.stringify({
        type: 'IamPolicyArtifactsOutput',
        value: {
          accountKey: 'master',
          bucketArn: 'arn:aws:s3:::pbmmaccel-master-phase0-configcacentral1-3574bod3khwt',
          bucketName: 'pbmmaccel-master-phase0-configcacentral1-3574bod3khwt',
          keyPrefix: 'iam-policy',
        },
      }),
    },
    {
      accountKey: 'master',
      outputKey: 'CentralBucketOutputBAF8A406',
      outputValue: JSON.stringify({
        type: 'CentralBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-master-phase0-configcacentral1-3574bod3khwt',
          bucketName: 'pbmmaccel-master-phase0-configcacentral1-3574bod3khwt',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:687384172140:key/c94a571b-25da-44a1-ac85-366d333ffb2a',
        },
      }),
    },
    {
      accountKey: 'master',
      outputKey: 'RdgwArtifactsOutputmasterOutputF3DB137F',
      outputValue: JSON.stringify({
        type: 'RdgwArtifactsOutput',
        value: {
          accountKey: 'master',
          bucketArn: 'arn:aws:s3:::pbmmaccel-master-phase0-configcacentral1-3574bod3khwt',
          bucketName: 'pbmmaccel-master-phase0-configcacentral1-3574bod3khwt',
          keyPrefix: 'config/scripts/',
        },
      }),
    },
    {
      accountKey: 'log-archive',
      outputKey: 'LogBucketOutput9005E9C6',
      outputValue: JSON.stringify({
        type: 'LogBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-logarchive-phase0-cacentral1-1fdlszygo5q6l',
          bucketName: 'pbmmaccel-logarchive-phase0-cacentral1-1fdlszygo5q6l',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:272091715658:key/18f7a4af-2fbb-4a4f-a597-7b0bae016c36',
        },
      }),
    },
    {
      accountKey: 'log-archive',
      outputKey: 'AesLogBucketOutput0333D00E',
      outputValue: JSON.stringify({
        type: 'AesBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-logarchive-phase0-aescacentral1-7iadcqkmhk3i',
          bucketName: 'pbmmaccel-logarchive-phase0-aescacentral1-7iadcqkmhk3i',
        },
      }),
    },
    {
      accountKey: 'security',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-security-phase1-cacentral1-1udpzdaewgqu3',
          bucketName: 'pbmmaccel-security-phase1-cacentral1-1udpzdaewgqu3',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:122259674264:key/ba5d50a0-e25d-4d7e-b15e-bad6d4054310',
        },
      }),
    },
    {
      accountKey: 'shared-services',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-sharedservices-phase1-cacentral1-1crul1c6woto0',
          bucketName: 'pbmmaccel-sharedservices-phase1-cacentral1-1crul1c6woto0',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:378053304141:key/f6c1ec02-e1cb-4ace-8abf-25574551cf32',
        },
      }),
    },
    {
      accountKey: 'fun-acct',
      outputKey: 'SandboxVpcOutput323ACFBC',
      outputValue: JSON.stringify({
        type: 'VpcOutput',
        value: {
          vpcId: 'vpc-02bcf75f21ece6cc7',
          vpcName: 'Sandbox',
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
        },
      }),
    },
    {
      accountKey: 'fun-acct',
      outputKey: 'DefaultBucketOutput0C96C44C',
      outputValue: JSON.stringify({
        type: 'AccountBucket',
        value: {
          bucketArn: 'arn:aws:s3:::pbmmaccel-funacct-phase1-cacentral1-1qsru3dws5n76',
          bucketName: 'pbmmaccel-funacct-phase1-cacentral1-1qsru3dws5n76',
          encryptionKeyArn: 'arn:aws:kms:ca-central-1:934027390063:key/7592bb9b-43d1-45d3-be51-bbc59cb06471',
        },
      }),
    },
  ];

  return {
    acceleratorConfig: config,
    accounts,
    context,
    limiter,
    outputs,
  };
}
