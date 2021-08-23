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

import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { MacieEnableAdmin } from '@aws-accelerator/custom-resource-macie-enable-admin';
import { MacieCreateMember } from '@aws-accelerator/custom-resource-macie-create-member';
import { MacieEnable } from '@aws-accelerator/custom-resource-macie-enable';
import { MacieUpdateConfig } from '@aws-accelerator/custom-resource-macie-update-config';
import { MacieExportConfig } from '@aws-accelerator/custom-resource-macie-export-config';
import { MacieUpdateSession } from '@aws-accelerator/custom-resource-macie-update-session';
import { AccountBuckets } from '../defaults';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export enum MacieFrequency {
  FIFTEEN_MINUTES = 'FIFTEEN_MINUTES',
  ONE_HOUR = 'ONE_HOUR',
  SIX_HOURS = 'SIX_HOURS',
}

export enum MacieStatus {
  ENABLED = 'ENABLED',
  PAUSED = 'PAUSED',
}

export interface MacieStepProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

export interface MacieStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

export interface MacieStep3Props {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

export async function enableMaciePolicy(props: MacieStep3Props) {
  const { accountBuckets, accountStacks, config, accounts } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterBucket = accountBuckets[masterAccountKey];
  // Enable Macie access see https://docs.aws.amazon.com/macie/latest/user/discovery-results-repository-s3.html
  masterBucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:GetBucketLocation', 's3:PutObject'],
      principals: [new iam.ServicePrincipal('macie.amazonaws.com')],
      resources: [masterBucket.bucketArn, masterBucket.arnForObjects('*')],
    }),
  );

  masterBucket.encryptionKey?.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'Allow Macie to use the key',
      principals: [new iam.ServicePrincipal('macie.amazonaws.com')],
      actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
      resources: ['*'],
    }),
  );
}

export async function step1(props: MacieStepProps) {
  const { accountStacks, config, accounts, outputs } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');

  const macieAdminRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: masterOrgKey,
    roleKey: 'MacieAdminRole',
  });
  if (!macieAdminRoleOutput) {
    return;
  }

  const macieEnableRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: masterOrgKey,
    roleKey: 'MacieEnableRole',
  });
  if (!macieEnableRoleOutput) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  const regions = await getValidRegions(config);
  const findingPublishingFrequency = await getFrequency(config);
  regions?.map(region => {
    // Macie admin need to be enabled from master account of the organization
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey, region);

    if (masterAccountId) {
      const admin = new MacieEnableAdmin(masterAccountStack, 'MacieEnableAdmin', {
        accountId: masterAccountId,
        roleArn: macieAdminRoleOutput.roleArn,
      });

      const enable = new MacieEnable(masterAccountStack, 'MacieEnable', {
        findingPublishingFrequency,
        status: MacieStatus.ENABLED,
        roleArn: macieEnableRoleOutput.roleArn,
      });
    }
  });
}

export async function step2(props: MacieStep2Props) {
  const { accountStacks, config, accounts, outputs } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  const regions = await getValidRegions(config);
  const findingPublishingFrequency = await getFrequency(config);

  const macieEnableRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: masterAccountKey,
    roleKey: 'MacieEnableRole',
  });
  if (!macieEnableRoleOutput) {
    return;
  }

  const macieUpdateConfigRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: masterAccountKey,
    roleKey: 'MacieUpdateConfigRole',
  });
  if (!macieUpdateConfigRoleOutput) {
    return;
  }

  const macieMemberRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: masterAccountKey,
    roleKey: 'MacieMemberRole',
  });
  if (!macieMemberRoleOutput) {
    return;
  }

  regions.map(region => {
    // Macie need to be turned on from macie master account
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);

    const enable = new MacieEnable(masterAccountStack, 'MacieEnable', {
      findingPublishingFrequency,
      status: MacieStatus.ENABLED,
      roleArn: macieEnableRoleOutput.roleArn,
    });

    // Add org members to Macie except Macie master account
    const accountDetails = accounts.map(account => ({
      accountId: account.id,
      email: account.email,
      roleArn: macieMemberRoleOutput.roleArn,
    }));
    for (const [index, account] of Object.entries(accountDetails)) {
      if (account.accountId !== masterAccountId) {
        const members = new MacieCreateMember(masterAccountStack, `MacieCreateMember${index}`, account);
      }
    }

    // turn on auto enable
    new MacieUpdateConfig(masterAccountStack, 'MacieUpdateConfig', {
      autoEnable: true,
      roleArn: macieUpdateConfigRoleOutput.roleArn,
    });
  });
}

export async function step3(props: MacieStep3Props) {
  const { accountBuckets, accountStacks, config, accounts, outputs } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterBucket = accountBuckets[masterAccountKey];
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  const regions = await getValidRegions(config);
  const masterBucketKeyArn = masterBucket.encryptionKey?.keyArn;
  const findingPublishingFrequency = await getFrequency(config);
  for (const [accountKey, _] of config.getAccountConfigs()) {
    const macieExportConfigRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'MacieExportConfigRole',
    });
    if (!macieExportConfigRoleOutput) {
      continue;
    }

    const macieUpdateSessionOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'MacieUpdateSessionRole',
    });
    if (!macieUpdateSessionOutput) {
      continue;
    }

    for (const region of regions) {
      const accountStack = accountStacks.getOrCreateAccountStack(accountKey, region);
      // configure export S3 bucket
      if (masterBucketKeyArn) {
        new MacieExportConfig(accountStack, 'MacieExportConfig', {
          bucketName: masterBucket.bucketName,
          keyPrefix: `${masterAccountId}`,
          kmsKeyArn: masterBucketKeyArn,
          roleArn: macieExportConfigRoleOutput.roleArn,
        });
      }

      // update frequency based on config
      new MacieUpdateSession(accountStack, 'MacieUpdateSession', {
        findingPublishingFrequency,
        status: MacieStatus.ENABLED,
        roleArn: macieUpdateSessionOutput.roleArn,
        publishSensitiveFindings: config['global-options']['central-security-services']['macie-sensitive-sh'],
      });
    }
  }
}

export async function getValidRegions(config: AcceleratorConfig) {
  const regions = config['global-options']['supported-regions'];
  const excl = config['global-options']['central-security-services']['macie-excl-regions'];
  const validRegions = regions.filter(x => !excl?.includes(x));
  return validRegions;
}

export async function getFrequency(config: AcceleratorConfig) {
  const frequency = config['global-options']['central-security-services']['macie-frequency'];
  if (frequency === MacieFrequency.SIX_HOURS) {
    return MacieFrequency.SIX_HOURS;
  } else if (frequency === MacieFrequency.ONE_HOUR) {
    return MacieFrequency.ONE_HOUR;
  } else if (frequency === MacieFrequency.FIFTEEN_MINUTES) {
    return MacieFrequency.FIFTEEN_MINUTES;
  } else {
    return MacieFrequency.SIX_HOURS;
  }
}
