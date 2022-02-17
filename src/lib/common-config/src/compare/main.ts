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

import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { AcceleratorConfig } from '..';
import { compareConfiguration, Diff, getAccountNames } from './config-diff';
import * as validate from './validate';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { number } from '@aws-accelerator/common-types';

/**
 * Retrieve and compare previous and the current configuration from CodeCommit
 */
export async function compareAcceleratorConfig(props: {
  repositoryName: string;
  configFilePath: string;
  commitId: string;
  previousCommitId: string;
  region: string;
  overrideConfig: { [name: string]: boolean };
  scope: 'FULL' | 'NEW-ACCOUNTS' | 'GLOBAL-OPTIONS' | 'ACCOUNT' | 'OU';
  vpcCidrPoolAssignedTable: string;
  subnetCidrPoolAssignedTable: string;
  outputs: StackOutput[];
  targetAccounts?: string[];
  targetOus?: string[];
}): Promise<string[]> {
  const {
    repositoryName,
    configFilePath: filePath,
    commitId,
    previousCommitId,
    region,
    overrideConfig,
    scope,
    targetAccounts,
    targetOus,
    subnetCidrPoolAssignedTable,
    vpcCidrPoolAssignedTable,
    outputs,
  } = props;

  const codeCommit = new CodeCommit();

  console.log('getting previous committed file from code commit');
  const previousConfigFile = await codeCommit.getFile(repositoryName, filePath, previousCommitId);
  const previousContent = previousConfigFile.fileContent.toString();

  // console.log('getting latest committed file from code commit');
  const updatedConfigFile = await codeCommit.getFile(repositoryName, filePath, commitId);
  console.log('reading latest committed file as string');
  const modifiedContent = updatedConfigFile.fileContent.toString();

  const previousConfig = JSON.parse(previousContent);
  const modifiedConfig = JSON.parse(modifiedContent);
  const acceleratorConfig = AcceleratorConfig.fromObject(modifiedConfig);
  const errors: string[] = [];

  // Check for duplicate email entry
  checkForEmailDuplicates(acceleratorConfig, errors);
  checkForMismatchedAccountKeys(modifiedConfig, errors);
  // compare both the configurations
  const configChanges = compareConfiguration(previousConfig, modifiedConfig);
  if (!configChanges) {
    console.log('no differences found');
    // Validate DDB Pool entries changes
    if (!overrideConfig['ov-cidr']) {
      await validate.validateDDBChanges(
        acceleratorConfig,
        vpcCidrPoolAssignedTable,
        subnetCidrPoolAssignedTable,
        outputs,
        errors,
      );
    }
    return errors;
  }

  scopeValidation(scope, configChanges, errors, targetAccounts || [], targetOus || []);

  // get all the accounts from previous commit
  const accountNames = getAccountNames(previousConfig);

  if (!overrideConfig['ov-global-options']) {
    await validate.validateGlobalOptions(configChanges, errors);
    const ouMasterRegion = modifiedConfig['global-options']['aws-org-management'].region;
    if (region !== ouMasterRegion) {
      errors.push(
        `ConfigCheck: state machine is running in the region ${region} but "aws-org-management" region has ${ouMasterRegion}`,
      );
    }
  }

  if (!overrideConfig['ov-del-accts']) {
    await validate.validateDeleteAccountConfig(accountNames, configChanges, errors);
  }

  if (!overrideConfig['ov-ren-accts']) {
    await validate.validateRenameAccountConfig(configChanges, errors);
  }

  if (!overrideConfig['ov-acct-email']) {
    await validate.validateAccountEmail(configChanges, errors);
  }

  if (!overrideConfig['ov-acct-warming']) {
    await validate.validateAccountWarming(configChanges, errors);
  }
  if (!overrideConfig['ov-acct-ou']) {
    await validate.validateAccountOu(configChanges, errors);
  }

  if (!overrideConfig['ov-acct-vpc']) {
    await validate.validateAccountVpc(configChanges, errors);
  }

  if (!overrideConfig['ov-acct-subnet']) {
    await validate.validateAccountSubnets(configChanges, errors);
  }

  if (!overrideConfig['ov-tgw']) {
    await validate.validateTgw(configChanges, errors);
  }

  if (!overrideConfig['ov-mad']) {
    await validate.validateMad(configChanges, errors);
  }

  // override not required
  await validate.validateVgw(configChanges, errors);

  if (!overrideConfig['ov-ou-vpc']) {
    await validate.validateOuVpc(configChanges, errors);
  }

  if (!overrideConfig['ov-ou-subnet']) {
    await validate.validateOuSubnets(configChanges, errors);
  }

  if (!overrideConfig['ov-share-to-ou']) {
    await validate.validateShareToOu(configChanges, errors);
  }

  if (!overrideConfig['ov-share-to-accounts']) {
    await validate.validateShareToAccounts(configChanges, errors);
  }

  if (!overrideConfig['ov-nacl']) {
    await validate.validateNacls(configChanges, errors);
  }

  if (!overrideConfig['ov-acct-vpc-optin']) {
    await validate.validateAccountOptInVpc(configChanges, errors);
  }

  if (!overrideConfig['ov-nfw']) {
    await validate.validateNfw(configChanges, errors);
  }

  // Validate DDB Pool entries changes
  if (!overrideConfig['ov-cidr']) {
    console.log(`Validating Cidr Changes`);
    await validate.validateDDBChanges(
      acceleratorConfig,
      vpcCidrPoolAssignedTable,
      subnetCidrPoolAssignedTable,
      outputs,
      errors,
    );
  }

  return errors;
}

function checkForEmailDuplicates(acceleratorConfig: AcceleratorConfig, errors: string[]) {
  console.log('checking for duplicate emails');
  const manditoryAccounts = Object.entries(acceleratorConfig['mandatory-account-configs']);
  const workloadAccounts = Object.entries(acceleratorConfig['workload-account-configs']);
  const emails = [];

  for (const [_key, obj] of manditoryAccounts) {
    emails.push(obj.email);
  }

  for (const [_key, obj] of workloadAccounts) {
    emails.push(obj.email);
  }

  const emailCounts = emails.reduce((acc: { [key: string]: number }, email) => {
    if (!acc[email]) {
      acc[email] = 1;
    } else {
      acc[email]++;
    }
    return acc;
  }, {});

  for (const [key, val] of Object.entries(emailCounts)) {
    if (val > 1) {
      errors.push(
        `found duplicate entries for key ${key} under manditory-account-configs or workload-account-configs. Please use unique email addresses for each account.`,
      );
    }
  }

  return errors;
}

function checkForMismatchedAccountKeys(acceleratorConfig: AcceleratorConfig, errors: string[]) {
  console.log('Checking for mismatched account keys');
  const mandatoryAccountKeys = [
    'aws-org-management',
    'central-security-services',
    'central-operations-services',
    'central-log-services',
  ];
  // @ts-ignore
  const globalAccountKeys = mandatoryAccountKeys.map(key => acceleratorConfig['global-options'][key].account);
  const manditoryAccountKeys = Object.keys(acceleratorConfig['mandatory-account-configs']);
  globalAccountKeys.forEach(globalKey => {
    if (!manditoryAccountKeys.includes(globalKey)) {
      errors.push(`The account key ${globalKey} is not defined in manditory-account-configs.`);
    }
  });
  return errors;
}

function scopeValidation(
  scope: 'FULL' | 'NEW-ACCOUNTS' | 'GLOBAL-OPTIONS' | 'ACCOUNT' | 'OU',
  configChanges: Diff[],
  errors: string[],
  accounts: string[],
  ous: string[],
) {
  const validateNewAccounts = function () {
    const newAccountsValidation = configChanges.filter(
      cc =>
        !(
          cc.path?.length === 2 &&
          cc.kind === 'N' &&
          ['workload-account-configs', 'mandatory-account-configs'].includes(cc.path?.[0])
        ),
    );
    if (newAccountsValidation.length > 0) {
      errors.push(
        ...newAccountsValidation.map(
          cc => `ConfigCheck: blocked changing from config path "${cc.path?.join('/')}" in SCOPE validation`,
        ),
      );
    }
  };
  const validateGlobalOptions = function () {
    const globalOptionsValidation = configChanges.filter(cc => cc.path?.[0] !== 'global-options');
    if (globalOptionsValidation.length > 0) {
      errors.push(
        ...globalOptionsValidation.map(
          cc => `ConfigCheck: blocked changing from config path "${cc.path?.join('/')}" in SCOPE validation`,
        ),
      );
    }
  };
  const validateAccounts = function () {
    const accountsValidation = configChanges.filter(
      cc => !['workload-account-configs', 'mandatory-account-configs'].includes(cc.path?.[0]),
    );
    if (accountsValidation.length > 0) {
      errors.push(
        ...accountsValidation.map(
          cc => `ConfigCheck: blocked changing from config path "${cc.path?.join('/')}" in SCOPE validation`,
        ),
      );
      return;
    }
    if (accounts && accounts.length > 0) {
      // Changes allowed only in Account configuration for both mandatory and workload
      if (accounts.includes('ALL')) {
        return;
      }
      const namedAndMandatoryAccsValidation = configChanges.filter(
        cc => cc.path?.length !== 2 && !accounts.includes(cc.path?.[1]) && cc.path?.[0] !== 'mandatory-account-configs',
      );
      if (namedAndMandatoryAccsValidation.length > 0) {
        errors.push(
          ...namedAndMandatoryAccsValidation.map(
            cc => `ConfigCheck: blocked changing from config path "${cc.path?.join('/')}" in SCOPE validation`,
          ),
        );
      }
      const newAccountValidation = configChanges.filter(cc => cc.path?.length === 2 && cc.kind === 'N');
      if (!accounts.includes('NEW') && newAccountValidation.length > 0) {
        // New Account addition is only allowed if 'NEW' in accounts
        errors.push(
          ...newAccountValidation.map(
            cc => `ConfigCheck: blocked changing from config path "${cc.path?.join('/')}" in SCOPE validation`,
          ),
        );
      }
    } else {
      throw new Error('"targetAccounts" is mandatory if scope="ACCOUNT"');
    }
  };
  const validateOus = function () {
    const ouValidation = configChanges.filter(cc => cc.path?.[0] !== 'organizational-units');
    if (ouValidation.length > 0) {
      errors.push(
        ...ouValidation.map(
          cc => `ConfigCheck: blocked changing from config path "${cc.path?.join('/')}" in SCOPE validation`,
        ),
      );
    }
    if (ous && ous.length > 0) {
      // Changes allowed only in Account configuration for both mandatory and workload
      if (ous.includes('ALL')) {
        return;
      }
      const namedOuValidation = configChanges.filter(
        cc => cc.path?.[0] !== 'organizational-units' && !ous.includes(cc.path?.[1]),
      );
      if (namedOuValidation.length > 0) {
        errors.push(
          ...namedOuValidation.map(
            cc => `ConfigCheck: blocked changing from config path "${cc.path?.join('/')}" in SCOPE validation`,
          ),
        );
      }
    } else {
      throw new Error('"targetOus" is mandatory if scope="OU"');
    }
  };
  if (scope === 'NEW-ACCOUNTS') {
    validateNewAccounts();
  } else if (scope === 'GLOBAL-OPTIONS') {
    validateGlobalOptions();
  } else if (scope === 'ACCOUNT') {
    validateAccounts();
  } else if (scope === 'OU') {
    validateOus();
  }
}
