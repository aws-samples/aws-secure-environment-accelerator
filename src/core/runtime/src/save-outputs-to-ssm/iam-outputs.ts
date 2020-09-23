import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, SaveOutputsInput, saveIndexOutput, OutputUtilGenericType, getIamSsmOutput } from './utils';
import { IamConfig } from '@aws-accelerator/common-config';
import {
  prepareMandatoryAccountIamConfigs,
  prepareOuAccountIamConfigs,
  saveIamRoles,
  saveIamPolicy,
  saveIamUsers,
  saveIamGroups,
} from './iam-utils';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';

interface IamOutput {
  roles: OutputUtilGenericType[];
  policies: OutputUtilGenericType[];
  users: OutputUtilGenericType[];
  groups: OutputUtilGenericType[];
}

/**
 * Outputs for IAM related deployments will be found in following phases
 * Phase 1
 */

/**
 *
 * @param outputsTableName
 * @param client
 * @param config
 * @param account
 *
 * @returns void
 */
export async function saveIamOutputs(props: SaveOutputsInput) {
  const {
    acceleratorPrefix,
    account,
    config,
    dynamodb,
    outputsTableName,
    assumeRoleName,
    region,
    outputUtilsTableName,
  } = props;

  const accountConfig = config.getMandatoryAccountConfigs().find(([accountKey, _]) => accountKey === account.key);
  const accountsIam: { [accountKey: string]: IamConfig[] } = {};

  // finding iam for account iam configs
  prepareMandatoryAccountIamConfigs(accountsIam, accountConfig);

  // finding iam for ou iam configs
  prepareOuAccountIamConfigs(config, account, accountsIam);
  // console.log('Accounts Iam', Object.keys(accountsIam));

  // if no IAM Config found for the account, return
  if (Object.keys(accountsIam).length === 0) {
    return;
  }

  const smRegion = config['global-options']['aws-org-master'].region;
  const outputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${smRegion}-1`, dynamodb);
  const ssmOutputs = await getIamSsmOutput(outputUtilsTableName, `${account.key}-${region}-identity`, dynamodb);
  // console.log('ssmOutputs', ssmOutputs);

  const roles: OutputUtilGenericType[] = [];
  const policies: OutputUtilGenericType[] = [];
  const users: OutputUtilGenericType[] = [];
  const groups: OutputUtilGenericType[] = [];

  if (ssmOutputs) {
    const ssmIamOutput: IamOutput = JSON.parse(ssmOutputs);
    roles.push(...ssmIamOutput.roles);
    policies.push(...ssmIamOutput.policies);
    users.push(...ssmIamOutput.users);
    groups.push(...ssmIamOutput.groups);
  }

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);

  const updatedRoles = await saveIamRoles(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    roles,
  );
  const updatedPolicies = await saveIamPolicy(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    policies,
  );
  const updatedUsers = await saveIamUsers(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    users,
  );
  const updatedGroups = await saveIamGroups(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    groups,
  );

  const iamOutput: IamOutput = {
    roles: updatedRoles,
    policies: updatedPolicies,
    users: updatedUsers,
    groups: updatedGroups,
  };
  const iamIndexOutput = JSON.stringify(iamOutput);
  console.log('indexOutput', iamIndexOutput);
  saveIndexOutput(outputUtilsTableName, `${account.key}-${region}-identity`, iamIndexOutput, dynamodb);
}
