import * as validateConfig from './common';
import { Diff } from 'deep-diff';
import { LHS, RHS } from '../../aws/config-diff';

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
const ACCOUNT_VPC_NAME = ['mandatory-account-configs', 'vpc', 'name'];
const ACCOUNT_VPC_REGION = ['mandatory-account-configs', 'vpc', 'region'];
const ACCOUNT_VPC_DEPLOY = ['mandatory-account-configs', 'vpc', 'deploy'];
const ACCOUNT_VPC_CIDR = ['mandatory-account-configs', 'vpc', 'cidr', 'ipv4', 'value'];
const ACCOUNT_VPC_CIDR2 = ['mandatory-account-configs', 'vpc', 'cidr2', 'ipv4', 'value'];

/**
 * config path(s) for mandatory accounts vpc subnets
 */
const ACCOUNT_SUBNETS = ['mandatory-account-configs', 'vpc', 'subnets'];
const ACCOUNT_SUBNET_NAME = ['mandatory-account-configs', 'vpc', 'subnets', 'name'];
const ACCOUNT_SUBNET_AZ = ['mandatory-account-configs', 'vpc', 'subnets', 'definitions', 'az'];
const ACCOUNT_SUBNET_CIDR = ['mandatory-account-configs', 'vpc', 'subnets', 'definitions', 'cidr', 'ipv4', 'value'];
const ACCOUNT_SUBNET_CIDR2 = ['mandatory-account-configs', 'vpc', 'subnets', 'definitions', 'cidr2', 'ipv4', 'value'];
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
const OU_VPC_NAME = ['organizational-units', 'vpc', 'name'];
const OU_VPC_REGION = ['organizational-units', 'vpc', 'region'];
const OU_VPC_DEPLOY = ['organizational-units', 'vpc', 'deploy'];
const OU_VPC_CIDR = ['organizational-units', 'vpc', 'cidr', 'ipv4', 'value'];
const OU_VPC_CIDR2 = ['organizational-units', 'vpc', 'cidr2', 'ipv4', 'value'];

/**
 * config path(s) for organizational units vpc subnets
 */
const OU_SUBNETS = ['organizational-units', 'vpc', 'subnets'];
const OU_SUBNET_NAME = ['organizational-units', 'vpc', 'subnets', 'name'];
const OU_SUBNET_AZ = ['organizational-units', 'vpc', 'subnets', 'definitions', 'az'];
const OU_SUBNET_CIDR = ['organizational-units', 'vpc', 'subnets', 'definitions', 'cidr', 'ipv4', 'value'];
const OU_SUBNET_CIDR2 = ['organizational-units', 'vpc', 'subnets', 'definitions', 'cidr2', 'ipv4', 'value'];
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
  const alzBaseline = await validateConfig.matchEditedConfigPath(differences, 'alz-baseline', false);
  if (alzBaseline) {
    errors.push(...alzBaseline);
  }

  // below function to check ct-baseline change
  const ctBaseline = await validateConfig.matchEditedConfigPath(differences, 'ct-baseline', false);
  if (ctBaseline) {
    errors.push(...ctBaseline);
  }
  // below function to check master account name change
  const account = await validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_AOM_ACCOUNT);
  if (account) {
    errors.push(account);
  }

  // below function to check master region name change
  // TODO validate the SM executed in the same region
  const masterRegion = await validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_AOM_REGION);
  if (masterRegion) {
    errors.push(masterRegion);
  }

  // below function to check master account name change
  const logAccount = await validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_CLS_ACCOUNT);
  if (logAccount) {
    errors.push(logAccount);
  }

  // below function to check master region name change
  // TODO validate the SM executed in the same region
  const logRegion = await validateConfig.matchConfigPath(differences, GLOBAL_OPTIONS_CLS_REGION);
  if (logRegion) {
    errors.push(logRegion);
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
  const deletedAccount = await validateConfig.deletedSubAccount(accountNames, differences);
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
  const renameAccount = await validateConfig.matchEditedConfigPath(differences, 'account-name', true);
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
  const accountEmail = await validateConfig.matchEditedConfigPath(differences, 'email', true, 3);
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
  const accountOu = await validateConfig.matchEditedConfigPath(differences, 'ou', true, 3);
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
  // the below function checks vpc deploy of the account
  const accountVpcDeploy = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_DEPLOY, 5);
  if (accountVpcDeploy) {
    errors.push(...accountVpcDeploy);
  }

  // the below function checks vpc name of the account
  const accountVpcName = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_NAME, 5);
  if (accountVpcName) {
    errors.push(...accountVpcName);
  }

  // the below function checks vpc cidr of the account
  const accountVpcCidr = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_CIDR, 8);
  if (accountVpcCidr) {
    errors.push(...accountVpcCidr);
  }

  // the below function checks vpc cidr2 of the account
  const accountVpcCidr2 = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_CIDR2, 8);
  if (accountVpcCidr2) {
    errors.push(...accountVpcCidr2);
  }

  // the below function checks vpc region of the account
  const accountVpcRegion = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_VPC_REGION, 5);
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
  const removeAccountSubnets = await validateConfig.matchConfigDependencyArray(differences, ACCOUNT_SUBNETS, 5);
  if (removeAccountSubnets) {
    errors.push(...removeAccountSubnets);
  }

  const updatedAccountSubnetName = await validateConfig.matchEditedConfigDependency(
    differences,
    ACCOUNT_SUBNET_NAME,
    7,
  );
  if (updatedAccountSubnetName) {
    errors.push(...updatedAccountSubnetName);
  }

  const updatedAccountSubnetAz = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_SUBNET_AZ, 9);
  if (updatedAccountSubnetAz) {
    errors.push(...updatedAccountSubnetAz);
  }

  // the below function checks subnet cidr of the account
  const accountSubnetCidr = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_SUBNET_CIDR, 12);
  if (accountSubnetCidr) {
    errors.push(...accountSubnetCidr);
  }

  // the below function checks subnet cidr of the account
  const accountSubnetCidr2 = await validateConfig.matchEditedConfigDependency(differences, ACCOUNT_SUBNET_CIDR2, 12);
  if (accountSubnetCidr2) {
    errors.push(...accountSubnetCidr2);
  }

  const accountSubnetDisabled = await validateConfig.matchEditedConfigPathDisabled(
    differences,
    ACCOUNT_SUBNET_DISABLED,
    9,
  );
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
  const tgwName = await validateConfig.matchEditedConfigDependency(differences, TGW_NAME, 5);
  if (tgwName) {
    errors.push(...tgwName);
  }

  const tgwAsn = await validateConfig.matchEditedConfigDependency(differences, TGW_ASN, 5);
  if (tgwAsn) {
    errors.push(...tgwAsn);
  }

  const tgwRegion = await validateConfig.matchEditedConfigDependency(differences, TGW_REGION, 5);
  if (tgwRegion) {
    errors.push(...tgwRegion);
  }

  const tgwFeatures = await validateConfig.matchEditedConfigPathValues(differences, TGW_FEATURES, false, 6);
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
  const madDirId = await validateConfig.matchEditedConfigPathValues(differences, MAD_DIR_ID, false, 5);
  if (madDirId) {
    errors.push(...madDirId);
  }

  const madDeploy = await validateConfig.matchEditedConfigPathValues(differences, MAD_DEPLOY, false, 5);
  if (madDeploy) {
    errors.push(...madDeploy);
  }

  const madVpcName = await validateConfig.matchEditedConfigPathValues(differences, MAD_VPC_NAME, false, 5);
  if (madVpcName) {
    errors.push(...madVpcName);
  }

  const madRegion = await validateConfig.matchEditedConfigPathValues(differences, MAD_REGION, false, 5);
  if (madRegion) {
    errors.push(...madRegion);
  }

  const madSubnet = await validateConfig.matchEditedConfigPathValues(differences, MAD_SUBNET, false, 5);
  if (madSubnet) {
    errors.push(...madSubnet);
  }

  const madSize = await validateConfig.matchEditedConfigPathValues(differences, MAD_SIZE, false, 5);
  if (madSize) {
    errors.push(...madSize);
  }

  const madDns = await validateConfig.matchEditedConfigPathValues(differences, MAD_DNS, false, 5);
  if (madDns) {
    errors.push(...madDns);
  }

  const madNetBios = await validateConfig.matchEditedConfigPathValues(differences, MAD_NETBIOS, false, 5);
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
  const vgwAsn = await validateConfig.matchEditedConfigDependency(differences, VGW_ASN, 6);
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
  // the below function checks vpc deploy of the account
  const ouVpcDeploy = await validateConfig.matchEditedConfigDependency(differences, OU_VPC_DEPLOY, 5);
  if (ouVpcDeploy) {
    errors.push(...ouVpcDeploy);
  }

  // the below function checks vpc name of the account
  const ouVpcName = await validateConfig.matchEditedConfigDependency(differences, OU_VPC_NAME, 5);
  if (ouVpcName) {
    errors.push(...ouVpcName);
  }

  // the below function checks vpc cidr of the account
  const ouVpcCidr = await validateConfig.matchEditedConfigDependency(differences, OU_VPC_CIDR, 8);
  if (ouVpcCidr) {
    errors.push(...ouVpcCidr);
  }

  // the below function checks vpc cidr2 of the account
  const ouVpcCidr2 = await validateConfig.matchEditedConfigDependency(differences, OU_VPC_CIDR2, 8);
  if (ouVpcCidr2) {
    errors.push(...ouVpcCidr2);
  }

  // the below function checks vpc region of the account
  const ouVpcRegion = await validateConfig.matchEditedConfigDependency(differences, OU_VPC_REGION, 5);
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
  const removeOuSubnets = await validateConfig.matchConfigDependencyArray(differences, OU_SUBNETS, 5);
  if (removeOuSubnets) {
    errors.push(...removeOuSubnets);
  }

  const ouSubnetName = await validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_NAME, 7);
  if (ouSubnetName) {
    errors.push(...ouSubnetName);
  }

  const ouSubnetAz = await validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_AZ, 9);
  if (ouSubnetAz) {
    errors.push(...ouSubnetAz);
  }

  // the below function checks subnet cidr of the account
  const ouSubnetCidr = await validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_CIDR, 12);
  if (ouSubnetCidr) {
    errors.push(...ouSubnetCidr);
  }

  // the below function checks subnet cidr of the account
  const ouSubnetCidr2 = await validateConfig.matchEditedConfigDependency(differences, OU_SUBNET_CIDR2, 12);
  if (ouSubnetCidr2) {
    errors.push(...ouSubnetCidr2);
  }

  const ouSubnetDisabled = await validateConfig.matchEditedConfigPathDisabled(differences, OU_SUBNET_DISABLED, 9);
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
  const shareToOu = await validateConfig.matchEditedConfigPath(differences, 'share-to-ou-accounts', true);
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
  const shareToAccounts = await validateConfig.editedConfigDependency(differences, ['share-to-specific-accounts']);
  if (shareToAccounts) {
    errors.push(...shareToAccounts);
  }

  const shareToAccountsArray = await validateConfig.deletedConfigDependencyArray(
    differences,
    'share-to-specific-accounts',
  );
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
  const naclRules = await validateConfig.editedConfigDependency(differences, OU_NACLS);
  if (naclRules) {
    errors.push(...naclRules);
  }

  const naclsSubnet = await validateConfig.editedConfigArray(differences, OU_NACLS_SUBNET);
  if (naclsSubnet) {
    errors.push(...naclsSubnet);
  }
}
