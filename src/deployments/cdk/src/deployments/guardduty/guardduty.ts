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

import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { GuardDutyAdmin } from '@aws-accelerator/custom-resource-guardduty-enable-admin';
import { GuardDutyDetector } from '@aws-accelerator/custom-resource-guardduty-get-detector';
import { GuardDutyCreatePublish } from '@aws-accelerator/custom-resource-guardduty-create-publish';
import { GuardDutyAdminSetup } from '@aws-accelerator/custom-resource-guardduty-admin-setup';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export enum GuardDutyFrequency {
  FIFTEEN_MINUTES = 'FIFTEEN_MINUTES',
  ONE_HOUR = 'ONE_HOUR',
  SIX_HOURS = 'SIX_HOURS',
}

export interface GuardDutyStepProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

export interface GuardDutyStep3Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  logBucket: IBucket;
  outputs: StackOutput[];
}

/**
 * Step 1 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 *
 * @param props accountStacks and config passed from phases
 */
export async function step1(props: GuardDutyStepProps) {
  const enableGuardDuty = props.config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const masterOrgKey = props.config.getMandatoryAccountKey('master');

  const masterAccountKey = props.config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(props.accounts, masterAccountKey);
  const regions = await getValidRegions(props.config);
  const adminRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs: props.outputs,
    accountKey: masterOrgKey,
    roleKey: 'GuardDutyAdminRole',
  });
  if (!adminRoleOutput) {
    return;
  }

  // const adminRole = await createAdminRole(masterAccountStack);
  regions?.map(region => {
    // Guard duty need to be enabled from master account of the organization
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterOrgKey, region);

    if (masterAccountId) {
      new GuardDutyAdmin(masterAccountStack, 'GuardDutyAdminSetup', {
        accountId: masterAccountId,
        roleArn: adminRoleOutput.roleArn,
      });
    }
  });
}

/**
 * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 *
 * @param props accountStacks and config passed from phases
 */
export async function step2(props: GuardDutyStepProps) {
  const enableGuardDuty = props.config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const masterAccountKey = props.config['global-options']['central-security-services'].account;
  const adminSetupRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs: props.outputs,
    accountKey: masterAccountKey,
    roleKey: 'GuardDutyAdminSetupRole',
  });
  if (!adminSetupRoleOutput) {
    return;
  }

  const regions = await getValidRegions(props.config);
  const accountDetails = props.accounts.map(account => ({
    AccountId: account.id,
    Email: account.email,
  }));
  const centralServiceConfig = props.config['global-options']['central-security-services'];
  const s3ProtectionExclRegions = centralServiceConfig['guardduty-s3-excl-regions'] || [];
  const eksProtectionExclRegions = centralServiceConfig['guardduty-eks-excl-regions'] || [];
  const frequency = await getFrequency(props.config);
  regions?.map(region => {
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey, region);
    new GuardDutyAdminSetup(masterAccountStack, 'GuardDutyAdminSetup', {
      memberAccounts: accountDetails,
      roleArn: adminSetupRoleOutput.roleArn,
      s3Protection: centralServiceConfig['guardduty-s3'] && !s3ProtectionExclRegions.includes(region),
      eksProtection: centralServiceConfig['guardduty-eks'] && !eksProtectionExclRegions.includes(region),
      frequency,
    });
  });
}

export async function step3(props: GuardDutyStep3Props) {
  const { logBucket, outputs } = props;
  const enableGuardDuty = props.config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const logBucketKeyArn = logBucket.encryptionKey?.keyArn;
  const regions = await getValidRegions(props.config);
  for (const [accountKey, _] of props.config.getAccountConfigs()) {
    const detectorRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'GuardDutyDetectorRole',
    });
    if (!detectorRoleOutput) {
      continue;
    }

    const createPublishOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'GuardDutyPublishRole',
    });
    if (!createPublishOutput) {
      continue;
    }

    for (const region of regions) {
      const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey, region);
      const detector = new GuardDutyDetector(accountStack, 'GuardDutyPublishDetector', {
        roleArn: detectorRoleOutput.roleArn,
      });

      if (logBucketKeyArn) {
        const createPublish = new GuardDutyCreatePublish(accountStack, 'GuardDutyPublish', {
          detectorId: detector.detectorId,
          destinationArn: logBucket.bucketArn,
          kmsKeyArn: logBucketKeyArn,
          roleArn: createPublishOutput.roleArn,
        });
        createPublish.node.addDependency(detector);
      }
    }
  }
}

export async function enableGuardDutyPolicy(props: GuardDutyStep3Props) {
  const { logBucket } = props;

  // Grant GuardDuty permission to logBucket: https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_exportfindings.html
  logBucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:GetBucketLocation', 's3:PutObject'],
      principals: [new iam.ServicePrincipal('guardduty.amazonaws.com')],
      resources: [logBucket.bucketArn, logBucket.arnForObjects('*')],
    }),
  );

  logBucket.encryptionKey?.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'Allow Guardduty to use the key',
      principals: [new iam.ServicePrincipal('guardduty.amazonaws.com')],
      actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
      resources: ['*'],
    }),
  );
}

export async function getValidRegions(config: AcceleratorConfig) {
  const regions = config['global-options']['supported-regions'];
  const excl = config['global-options']['central-security-services']['guardduty-excl-regions'];
  const validRegions = regions.filter(x => !excl?.includes(x));
  return validRegions;
}

export async function getFrequency(config: AcceleratorConfig) {
  const frequency = config['global-options']['central-security-services']['guardduty-frequency'];
  if (frequency === GuardDutyFrequency.SIX_HOURS) {
    return GuardDutyFrequency.SIX_HOURS;
  } else if (frequency === GuardDutyFrequency.ONE_HOUR) {
    return GuardDutyFrequency.ONE_HOUR;
  } else if (frequency === GuardDutyFrequency.FIFTEEN_MINUTES) {
    return GuardDutyFrequency.FIFTEEN_MINUTES;
  } else {
    return GuardDutyFrequency.SIX_HOURS;
  }
}
