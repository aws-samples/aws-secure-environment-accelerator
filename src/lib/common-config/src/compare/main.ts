import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { config } from 'aws-sdk';
import { compareConfiguration, Diff, getAccountNames } from './config-diff';
import * as validate from './validate';
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

  const errors: string[] = [];

  // compare both the configurations
  const configChanges = compareConfiguration(previousConfig, modifiedConfig);
  if (!configChanges) {
    console.log('no differences found');
    return errors;
  }

  scopeValidation(scope, configChanges, errors, targetAccounts || [], targetOus || []);

  // get all the accounts from previous commit
  const accountNames = getAccountNames(previousConfig);

  if (!overrideConfig['ov-global-options']) {
    await validate.validateGlobalOptions(configChanges, errors);
    const ouMasterRegion = modifiedConfig['global-options']['aws-org-master'].region;
    if (region !== ouMasterRegion) {
      errors.push(
        `ConfigCheck: state machine is running in the region ${region} but "aws-org-master" region has ${ouMasterRegion}`,
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
      throw new Error('"loadOus" is mandatory if scope="OU"');
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
