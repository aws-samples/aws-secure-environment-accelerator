import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { StepFunctions } from '@aws-pbmm/common-lambda/lib/aws/stepfunctions';
import * as org from 'aws-sdk/clients/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { AcceleratorConfig, AccountsConfig } from '@aws-pbmm/common-lambda/lib/config';

const FULL_AWS_ACCESS_POLICY_NAME = 'FullAWSAccess';

interface PolicyChangeEvent extends ScheduledEvent {
  version?: string;
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION! || 'ca-central-1';
const acceleratorPrefix = process.env.ACCELERATOR_PREFIX! || 'PBMMAccel-';
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME! || 'PBMMAccel-Config-Repo';
const configFilePath = process.env.CONFIG_FILE_PATH! || 'config.json';
const configBranch = process.env.CONFIG_BRANCH_NAME! || 'master';
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME! || 'PBMMAccel-L-SFN-MasterRole-DD650BE8';

const organizations = new Organizations();

export const handler = async (input: PolicyChangeEvent) => {
  console.log(`ChangePolicy Event triggered invocation...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;
  const invokedBy = requestDetail.userIdentity.sessionContext.sessionIssuer.userName;
  if (invokedBy === acceleratorRoleName) {
    console.log(`Move Account Performed by Accelerator, No operation required`);
    return {
      status: 'NO_OPERATION_REQUIRED',
    };
  }
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configBranch,
    defaultRegion,
  });

  const scps = config["global-options"].scps;
  const scpNames = scps.map(scp => policyNameToAcceleratorPolicyName({
    acceleratorPrefix,
    policyName: scp.name,
  }));

  const policyId = requestDetail.requestParameters.policyId;
  if (!policyId) {
    console.warn(`Missing policyId, Ignoring`);
    return 'INVALID_REQUEST';
  }
  if (!await isAcceleratorScp(policyId, scpNames)) {
    return 'SUCCESS';
  }
  const eventName = requestDetail.eventName;
  if (eventName === 'DetachPolicy') {
    const { targetId } = requestDetail.requestParameters;
    if (!targetId) {
      console.warn(`Missing required parameters, Ignoring`);
      return 'INVALID_REQUEST';
    }
    // ReAttach target to policy
    console.log(`ReAttaching target "${targetId}" to policy "${policyId}"`);
    await organizations.attachPolicy(policyId, targetId);
  } else if (eventName === 'UpdatePolicy') {
    console.log(`Policy updated`);
  } else if (eventName === 'DeletePolicy') {
    console.log(`Policy Deleted ReCreating policy ${policyId}`);
  }
  return 'SUCCESS';
};

async function isAcceleratorScp(policyId: string, scpNames: string[]): Promise<boolean> {
  const policyResponse = await organizations.describePolicy(policyId);
  const policy = policyResponse.Policy;
  if (!policy) {
    console.error(`Invalid PolicyId provided ${policyId}`);
    return false;
  }
  if (!scpNames.includes(policy.PolicySummary?.Name!)) {
    console.error(`Policy is not handled through Acclerator`);
    return false;
  }
  return true;
}

/**
 * Convert policy name to Accelerator policy name. If the policy name is the FullAWSAccess policy name, then we keep
 * the name as is. If the policy name does not have the Accelerator prefix, then we add the prefix.
 *
 * @return Policy name with Accelerator prefix.
 */
export function policyNameToAcceleratorPolicyName(props: { policyName: string; acceleratorPrefix: string }) {
  const { policyName, acceleratorPrefix } = props;
  if (policyName === FULL_AWS_ACCESS_POLICY_NAME || policyName.startsWith(acceleratorPrefix)) {
    return policyName;
  }
  return `${acceleratorPrefix}${policyName}`;
}