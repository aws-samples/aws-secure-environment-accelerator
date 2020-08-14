import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { compareConfiguration, getAccountNames } from './config-diff';
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
}): Promise<string[]> {
  const { repositoryName, configFilePath: filePath, commitId, previousCommitId, region, overrideConfig } = props;

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

  // get all the accounts from previous commit
  const accountNames = getAccountNames(previousConfig);
  console.log(accountNames);

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
