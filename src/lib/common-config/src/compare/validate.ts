import * as validateConfig from './common';
import { Diff } from 'deep-diff';
import { LHS, RHS } from './config-diff';

/**
 * config path(s) for global options
 */
const GLOBAL_OPTIONS_AOM_ACCOUNT = ['global-options', 'aws-org-master', 'account'];
const GLOBAL_OPTIONS_AOM_REGION = ['global-options', 'aws-org-master', 'region'];
const GLOBAL_OPTIONS_CLS_ACCOUNT = ['global-options', 'central-log-services', 'account'];
const GLOBAL_OPTIONS_CLS_REGION = ['global-options', 'central-log-services', 'region'];

/**
 * config path(s) for mandatory accounts vpc(s)
 */
const ACCOUNT_VPC = ['mandatory-account-configs', 'vpc'];
const ACCOUNT_VPC_NAME = ['mandatory-account-configs', 'vpc', 'name'];
const ACCOUNT_VPC_REGION = ['mandatory-account-configs', 'vpc', 'region'];
const ACCOUNT_VPC_DEPLOY = ['mandatory-account-configs', 'vpc', 'deploy'];
const ACCOUNT_VPC_CIDR = ['mandatory-account-configs', 'vpc', 'cidr'];
const ACCOUNT_VPC_CIDR2 = ['mandatory-account-configs', 'vpc', 'cidr2'];

/**
 * config path(s) for mandatory accounts vpc subnets
 */
const ACCOUNT_SUBNETS = ['mandatory-account-configs', 'vpc', 'subnets'];
const ACCOUNT_SUBNET_NAME = ['mandatory-account-configs', 'vpc', 'subnets', 'name'];
const ACCOUNT_SUBNET_AZ = ['mandatory-account-configs', 'vpc', 'subnets', 'definitions', 'az'];
const ACCOUNT_SUBNET_CIDR = ['mandatory-account-configs', 'vpc', 'subnets', 'definitions', 'cidr'];
const ACCOUNT_SUBNET_CIDR2 = ['mandatory-account-configs', 'vpc', 'subnets', 'definitions', 'cidr2'];
const ACCOUNT_SUBNET_DISABLED = ['mandatory-account-configs', 'vpc', 'subnets', 'definitions', 'disabled'];

/**
 * config path(s) for mandatory accounts vpc - TGW
 */
const TGW_NAME = ['mandatory-account-configs', 'deployments', 'tgw', 'name'];
const TGW_ASN = ['mandatory-account-configs', 'deployments', 'tgw', 'asn'];
const TGW_REGION = ['mandatory-account-configs', 'deployments', 'tgw', 'region'];
const TGW_FEATURES = ['mandatory-account-configs', 'deployments', 'tgw', 'features'];

/**
 * config path(s) for mandatory accounts - MAD
 */
const MAD_DIR_ID = ['mandatory-account-configs', 'deployments', 'mad', 'dir-id'];
const MAD_DEPLOY = ['mandatory-account-configs', 'deployments', 'mad', 'deploy'];
const MAD_VPC_NAME = ['mandatory-account-configs', 'deployments', 'mad', 'vpc-name'];
const MAD_REGION = ['mandatory-account-configs', 'deployments', 'mad', 'region'];
const MAD_SUBNET = ['mandatory-account-configs', 'deployments', 'mad', 'subnet'];
const MAD_SIZE = ['mandatory-account-configs', 'deployments', 'mad', 'size'];
const MAD_DNS = ['mandatory-account-configs', 'deployments', 'mad', 'dns-domain'];
const MAD_NETBIOS = ['mandatory-account-configs', 'deployments', 'mad', 'netbios-domain'];

/**
 * config path for mandatory accounts - VGW
 */
const VGW_ASN = ['mandatory-account-configs', 'vpc', 'vgw', 'asn'];

/**
 * config path(s) for organizational units - vpc
 */
const OU_VPC = ['organizational-units', 'vpc'];
const OU_VPC_NAME = ['organizational-units', 'vpc', 'name'];
const OU_VPC_REGION = ['organizational-units', 'vpc', 'region'];
const OU_VPC_DEPLOY = ['organizational-units', 'vpc', 'deploy'];
const OU_VPC_CIDR = ['organizational-units', 'vpc', 'cidr'];
const OU_VPC_CIDR2 = ['organizational-units', 'vpc', 'cidr2'];

/**
 * config path(s) for organizational units vpc subnets
 */
const OU_SUBNETS = ['organizational-units', 'vpc', 'subnets'];
const OU_SUBNET_NAME = ['organizational-units', 'vpc', 'subnets', 'name'];
const OU_SUBNET_AZ = ['organizational-units', 'vpc', 'subnets', 'definitions', 'az'];
const OU_SUBNET_CIDR = ['organizational-units', 'vpc', 'subnets', 'definitions', 'cidr'];
const OU_SUBNET_CIDR2 = ['organizational-units', 'vpc', 'subnets', 'definitions', 'cidr2'];
const OU_SUBNET_DISABLED = ['organizational-units', 'vpc', 'subnets', 'definitions', 'disabled'];

/**
 * config path(s) for organizational units vpc - NACLS
 */
const OU_NACLS = ['organizational-units', 'vpc', 'subnets', 'nacls'];
const OU_NACLS_SUBNET = ['organizational-units', 'vpc', 'subnets', 'nacls', 'cidr-blocks', 'subnet'];

/**
 *
 * function to validate Global Options changes
 *
 * @param differences
 * @param errors
 */
export async function validateGlobalOptions(
  differences: Diff<LHS, RHS>[],
  errors: string[],
): Promise<void | undefined> {
  // below function to check alz-baseline change
  const alzBaseline = validateConfig.matchEditedConfigPath(differences, 'alz-baseline', false);
  if (alzBaseline) {
    errors.push(...alzBaseline);
  }

  // below function to check ct-baseline change
  const ctBaseline = validateConfig.matchEditedConfigPath(differences, 'ct-baseline', false);
  if (ctBaseline) {
    errors.push(...ctBaseline);
  }
  // below function to check master account name change
  const account = validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_AOM_ACCOUNT);
  if (account) {
    errors.push(...account);
  }

  // below function to check master region name change
  // TODO validate the SM executed in the same region
  const masterRegion = validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_AOM_REGION);
  if (masterRegion) {
    errors.push(...masterRegion);
  }

  // below function to check master account name change
  const logAccount = validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_CLS_ACCOUNT);
  if (logAccount) {
    errors.push(...logAccount);
  }

  // below function to check master region name change
  // TODO validate the SM executed in the same region
  const logRegion = validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_CLS_REGION);
  if (logRegion) {
    errors.push(...logRegion);
  }
}

/**
 *
 * function to validate change/delete of account
 *
 * @param accountNames
 * @param differences
 * @param errors
 */
export async function validateDeleteAccountConfig(
  accountNames: string[],
  differences: Diff<LHS, RHS>[],
  errors: string[],
): Promise<void | undefined> {
  // below functions check whether sub accounts removed from config file
  const deletedAccount = validateConfig.deletedSubAccount(accountNames, differences);
  if (deletedAccount) {
    errors.push(...deletedAccount);
  }
}

/**
 *
 * function to validate rename of account name
 *
 * @param differences
 * @param errors
 */
export async function validateRenameAccountConfig(
  differences: Diff<LHS, RHS>[],
  errors: string[],
): Promise<void | undefined> {
  // the below function checks renaming of the sub accounts
  const renameAccount = validateConfig.matchEditedConfigPath(differences, 'account-name', true);
  if (renameAccount) {
    errors.push(...renameAccount);
  }
}

/**
 *
 * function to validate account email
 *
 * @param differences
 * @param errors
 */
export async function validateAccountEmail(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void | undefined> {
  // the below function checks sub account email
  const accountEmail = validateConfig.matchEditedConfigPath(differences, 'email', true, 3);
  if (accountEmail) {
    errors.push(...accountEmail);
  }
}

/**
 *
 * function to validate mandatory accounts OU
 *
 * @param differences
 * @param errors
 */
export async function validateAccountOu(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  // the below function checks sub account ou
  const accountOu = validateConfig.matchEditedConfigPath(differences, 'ou', true, 3);
  if (accountOu) {
    errors.push(...accountOu);
  }
}

/**
 *
 * function to validate mandatory account VPC configuration
 *
 * @param differences
 * @param errors
 */
export async function validateAccountVpc(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  // the below function checks vpc deletion from Account Config
  errors.push(...validateConfig.deletedConfigEntry(differences, ACCOUNT_VPC, 'vpc'));
  // the below function checks vpc deploy of the account
  const accountVpcDeploy = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_DEPLOY, 5);
  if (accountVpcDeploy) {
    errors.push(...accountVpcDeploy);
  }

  // the below function checks vpc name of the account
  const accountVpcName = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_NAME, 5);
  if (accountVpcName) {
    errors.push(...accountVpcName);
  }

  // the below function checks vpc cidr of the account
  const accountVpcCidr = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_CIDR, 5);
  if (accountVpcCidr) {
    errors.push(...accountVpcCidr);
  }

  // the below function checks vpc cidr2 of the account
  const accountVpcCidr2 = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_CIDR2, 5);
  if (accountVpcCidr2) {
    errors.push(...accountVpcCidr2);
  }

  // the below function checks vpc region of the account
  const accountVpcRegion = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_REGION, 5);
  if (accountVpcRegion) {
    errors.push(...accountVpcRegion);
  }
}

/**
 *
 * function to validate mandatory accounts subnet configuration
 *
 * @param differences
 * @param errors
 */
export async function validateAccountSubnets(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  const removeAccountSubnets = validateConfig.matchConfigDependencyArray(differences, ACCOUNT_SUBNETS, 5);
  if (removeAccountSubnets) {
    errors.push(...removeAccountSubnets);
  }

  const updatedAccountSubnetName = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_SUBNET_NAME, 7);
  if (updatedAccountSubnetName) {
    errors.push(...updatedAccountSubnetName);
  }

  const updatedAccountSubnetAz = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_SUBNET_AZ, 9);
  if (updatedAccountSubnetAz) {
    errors.push(...updatedAccountSubnetAz);
  }

  // the below function checks subnet cidr of the account
  const accountSubnetCidr = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_SUBNET_CIDR, 9);
  if (accountSubnetCidr) {
    errors.push(...accountSubnetCidr);
  }

  // the below function checks subnet cidr of the account
  const accountSubnetCidr2 = validateConfig.matchEditedConfigDependency(differences, ACCOUNT_SUBNET_CIDR2, 9);
  if (accountSubnetCidr2) {
    errors.push(...accountSubnetCidr2);
  }

  const accountSubnetDisabled = validateConfig.matchEditedConfigPathDisabled(differences, ACCOUNT_SUBNET_DISABLED, 9);
  if (accountSubnetDisabled) {
    errors.push(...accountSubnetDisabled);
  }
}

/**
 *
 * function to validate mandatory accounts TGW
 * @param differences
 * @param errors
 */
export async function validateTgw(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  // the below function checks vpc name of the account
  const tgwName = validateConfig.matchEditedConfigDependency(differences, TGW_NAME, 6);
  if (tgwName) {
    errors.push(...tgwName);
  }

  const tgwAsn = validateConfig.matchEditedConfigDependency(differences, TGW_ASN, 6);
  if (tgwAsn) {
    errors.push(...tgwAsn);
  }

  const tgwRegion = validateConfig.matchEditedConfigDependency(differences, TGW_REGION, 6);
  if (tgwRegion) {
    errors.push(...tgwRegion);
  }

  const tgwFeatures = validateConfig.matchEditedConfigPathValues(differences, TGW_FEATURES, false, 7);
  if (tgwFeatures) {
    errors.push(...tgwFeatures);
  }
}

/**
 *
 * function to validate mandatory accounts MAD configuration
 *
 * @param differences
 * @param errors
 */
export async function validateMad(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  const madDirId = validateConfig.matchEditedConfigPathValues(differences, MAD_DIR_ID, false, 5);
  if (madDirId) {
    errors.push(...madDirId);
  }

  const madDeploy = validateConfig.matchEditedConfigPathValues(differences, MAD_DEPLOY, false, 5);
  if (madDeploy) {
    errors.push(...madDeploy);
  }

  const madVpcName = validateConfig.matchEditedConfigPathValues(differences, MAD_VPC_NAME, false, 5);
  if (madVpcName) {
    errors.push(...madVpcName);
  }

  const madRegion = validateConfig.matchEditedConfigPathValues(differences, MAD_REGION, false, 5);
  if (madRegion) {
    errors.push(...madRegion);
  }

  const madSubnet = validateConfig.matchEditedConfigPathValues(differences, MAD_SUBNET, false, 5);
  if (madSubnet) {
    errors.push(...madSubnet);
  }

  const madSize = validateConfig.matchEditedConfigPathValues(differences, MAD_SIZE, false, 5);
  if (madSize) {
    errors.push(...madSize);
  }

  const madDns = validateConfig.matchEditedConfigPathValues(differences, MAD_DNS, false, 5);
  if (madDns) {
    errors.push(...madDns);
  }

  const madNetBios = validateConfig.matchEditedConfigPathValues(differences, MAD_NETBIOS, false, 5);
  if (madNetBios) {
    errors.push(...madNetBios);
  }
}

/**
 *
 * function to validate mandatory accounts VGW configuration
 *
 * @param differences
 * @param errors
 */
export async function validateVgw(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  const vgwAsn = validateConfig.matchEditedConfigDependency(differences, VGW_ASN, 6);
  if (vgwAsn) {
    errors.push(...vgwAsn);
  }
}

/**
 *
 * function to validate organizational units VPC configuration
 *
 * @param differences
 * @param errors
 */
export async function validateOuVpc(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  // the below function checks vpc deletion from Organizational Unit
  errors.push(...validateConfig.deletedConfigEntry(differences, OU_VPC, 'vpc'));
  // the below function checks vpc deploy of the account
  const ouVpcDeploy = validateConfig.matchEditedConfigDependency(differences, OU_VPC_DEPLOY, 5);
  if (ouVpcDeploy) {
    errors.push(...ouVpcDeploy);
  }

  // the below function checks vpc name of the account
  const ouVpcName = validateConfig.matchEditedConfigDependency(differences, OU_VPC_NAME, 5);
  if (ouVpcName) {
    errors.push(...ouVpcName);
  }

  // the below function checks vpc cidr of the account
  const ouVpcCidr = validateConfig.matchEditedConfigDependency(differences, OU_VPC_CIDR, 5);
  if (ouVpcCidr) {
    errors.push(...ouVpcCidr);
  }

  // the below function checks vpc cidr2 of the account
  const ouVpcCidr2 = validateConfig.matchEditedConfigDependency(differences, OU_VPC_CIDR2, 5);
  if (ouVpcCidr2) {
    errors.push(...ouVpcCidr2);
  }

  // the below function checks vpc region of the account
  const ouVpcRegion = validateConfig.matchEditedConfigDependency(differences, OU_VPC_REGION, 5);
  if (ouVpcRegion) {
    errors.push(...ouVpcRegion);
  }
}

/**
 *
 * function to validate organizational units subnet configuration
 *
 * @param differences
 * @param errors
 */
export async function validateOuSubnets(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  const removeOuSubnets = validateConfig.matchConfigDependencyArray(differences, OU_SUBNETS, 5);
  if (removeOuSubnets) {
    errors.push(...removeOuSubnets);
  }

  const ouSubnetName = validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_NAME, 7);
  if (ouSubnetName) {
    errors.push(...ouSubnetName);
  }

  const ouSubnetAz = validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_AZ, 9);
  if (ouSubnetAz) {
    errors.push(...ouSubnetAz);
  }

  // the below function checks subnet cidr of the account
  const ouSubnetCidr = validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_CIDR, 9);
  if (ouSubnetCidr) {
    errors.push(...ouSubnetCidr);
  }

  // the below function checks subnet cidr of the account
  const ouSubnetCidr2 = validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_CIDR2, 9);
  if (ouSubnetCidr2) {
    errors.push(...ouSubnetCidr2);
  }

  const ouSubnetDisabled = validateConfig.matchEditedConfigPathDisabled(differences, OU_SUBNET_DISABLED, 9);
  if (ouSubnetDisabled) {
    errors.push(...ouSubnetDisabled);
  }
}

/**
 *
 * function to validate organizational units share-to-ou-accounts configuration
 *
 * @param differences
 * @param errors
 */
export async function validateShareToOu(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  const shareToOu = validateConfig.matchEditedConfigPath(differences, 'share-to-ou-accounts', true);
  if (shareToOu) {
    errors.push(...shareToOu);
  }
}

/**
 *
 * function to validate organizational units share-to-specific-accounts configuration
 *
 * @param differences
 * @param errors
 */
export async function validateShareToAccounts(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  const shareToAccounts = validateConfig.editedConfigDependency(differences, ['share-to-specific-accounts']);
  if (shareToAccounts) {
    errors.push(...shareToAccounts);
  }

  const shareToAccountsArray = validateConfig.deletedConfigDependencyArray(differences, 'share-to-specific-accounts');
  if (shareToAccountsArray) {
    errors.push(...shareToAccountsArray);
  }
}

/**
 *
 * function to validate organizational units NACLS configuration
 *
 * @param differences
 * @param errors
 */
export async function validateNacls(differences: Diff<LHS, RHS>[], errors: string[]): Promise<void> {
  const naclRules = validateConfig.editedConfigDependency(differences, OU_NACLS);
  if (naclRules) {
    errors.push(...naclRules);
  }

  const naclsSubnet = validateConfig.editedConfigArray(differences, OU_NACLS_SUBNET);
  if (naclsSubnet) {
    errors.push(...naclsSubnet);
  }
}
