import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import * as org from 'aws-sdk/clients/organizations';
import { ServiceControlPolicy, FULL_AWS_ACCESS_POLICY_NAME } from '@aws-accelerator/common/src/scp';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { ScheduledEvent } from 'aws-lambda';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';
import { getInvoker } from './utils';

interface PolicyChangeEvent extends ScheduledEvent {
  version?: string;
}

export interface ConfigurationOrganizationalUnit {
  ouId: string;
  ouKey: string;
  ouName: string;
  ouPath: string;
}

export interface ConfigurationAccount {
  accountId?: string;
  accountKey: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  ouPath?: string;
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION!;
const acceleratorPrefix = process.env.ACCELERATOR_PREFIX!;
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME!;
const configFilePath = process.env.CONFIG_FILE_PATH!;
const configBranch = process.env.CONFIG_BRANCH_NAME!;
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME!;
const scpBucketPrefix = process.env.ACCELERATOR_SCP_BUCKET_PREFIX!;
const scpBucketName = process.env.ACCELERATOR_SCP_BUCKET_NAME!;

const organizations = new Organizations();

export const handler = async (input: PolicyChangeEvent) => {
  console.log(`ChangePolicy Event triggered invocation...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;
  const invokedBy = getInvoker(input);
  if (invokedBy && invokedBy === acceleratorRoleName) {
    console.log(`Policy Changes Performed by Accelerator, No operation required`);
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

  const organizationAdminRole = config['global-options']['organization-admin-role']!;
  const configScps = config['global-options'].scps;
  const ignoredOus: string[] = config['global-options']['ignored-ous'] || [];
  const scpNames = configScps.map(scp =>
    ServiceControlPolicy.policyNameToAcceleratorPolicyName({
      acceleratorPrefix,
      policyName: scp.name,
    }),
  );

  const policyId = requestDetail.requestParameters.policyId;
  if (!policyId) {
    console.warn(`Missing policyId, Ignoring`);
    return 'INVALID_REQUEST';
  }
  const eventName = requestDetail.eventName;
  if (eventName !== 'DeletePolicy' && !(await isAcceleratorScp(policyId, scpNames))) {
    console.log(`SCP ${policyId} is not managed by Accelerator`);
    return 'SUCCESS';
  }
  const scps = new ServiceControlPolicy(acceleratorPrefix, organizationAdminRole, organizations);
  const { organizationalUnits, accounts } = await loadAccountsAndOrganizationsFromConfig(config);
  if (eventName === 'DetachPolicy') {
    const { targetId } = requestDetail.requestParameters;
    if (!targetId) {
      console.warn(`Missing required parameters, Ignoring`);
      return 'INVALID_REQUEST';
    }
    if (ignoredOus.length > 0) {
      if (targetId.startsWith('ou-')) {
        const destinationOrg = await organizations.getOrganizationalUnitWithPath(targetId);
        const destinationRootOrg = destinationOrg.Name!;
        if (ignoredOus.includes(destinationRootOrg)) {
          console.log(`DetachPolicy is on ignored-ou from ROOT, no need to reattach`);
          return 'IGNORE';
        }
      } else {
        const accountObject = accounts.find(acc => acc.accountId === targetId);
        if (ignoredOus.includes(accountObject?.organizationalUnit!)) {
          console.log(`DetachPolicy is on account in ignored-ous from ROOT, no need to reattach`);
          return 'IGNORE';
        }
      }
    }
    // ReAttach target to policy
    console.log(`Reattaching target "${targetId}" to policy "${policyId}"`);
    await organizations.attachPolicy(policyId, targetId);
  } else if (eventName === 'UpdatePolicy' || eventName === 'DeletePolicy') {
    console.log(`${eventName}, changing back to original config from config`);

    // Find policy config
    const globalOptionsConfig = config['global-options'];
    const policyConfigs = globalOptionsConfig.scps;

    // Keep track of Accelerator policy names so we later can detach all non-Accelerator policies
    const acceleratorPolicies = await scps.createPoliciesFromConfiguration({
      acceleratorPrefix,
      scpBucketName,
      scpBucketPrefix,
      policyConfigs,
      organizationAdminRole,
    });
    const acceleratorPolicyNames = acceleratorPolicies.map(p => p.Name!);

    // Query all the existing policies
    const existingPolicies = await scps.listScps();

    // Find roots to attach FullAWSAccess
    const rootIds = await scps.organizationRoots();

    // Find Accelerator accounts and OUs to attach FullAWSAccess
    const acceleratorOuIds = organizationalUnits.map(ou => ou.ouId);
    const acceleratorAccountIds = accounts.map(a => a.accountId!);
    const acceleratorTargetIds = [...rootIds, ...acceleratorOuIds, ...acceleratorAccountIds];

    // Detach non-Accelerator policies from Accelerator accounts
    await scps.detachPoliciesFromTargets({
      policyNamesToKeep: acceleratorPolicyNames,
      policyTargetIdsToInclude: acceleratorTargetIds,
    });

    await scps.attachFullAwsAccessPolicyToTargets({
      existingPolicies,
      targetIds: acceleratorTargetIds,
    });

    await scps.attachOrDetachPoliciesToOrganizationalUnits({
      existingPolicies,
      configurationOus: organizationalUnits,
      acceleratorOus: config.getOrganizationalUnits(),
      acceleratorPrefix,
    });
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
  const policyName = policy.PolicySummary?.Name;
  if (!policyName) {
    return false;
  }
  if (policyName !== FULL_AWS_ACCESS_POLICY_NAME && !scpNames.includes(policy.PolicySummary?.Name!)) {
    console.error(`Policy is not handled through Acclerator`);
    return false;
  }
  return true;
}

async function loadAccountsAndOrganizationsFromConfig(
  config: AcceleratorConfig,
): Promise<{ organizationalUnits: OrganizationalUnit[]; accounts: ConfigurationAccount[] }> {
  // Find OUs and accounts in AWS account
  const awsOus = await organizations.listOrganizationalUnits();
  const awsOuAccountMap: { [ouId: string]: org.Account[] } = {};
  const awsAccounts: org.Account[] = [];

  // Store organizational units and their accounts
  for (const organizationalUnit of awsOus) {
    const ouId = organizationalUnit.Id!;
    const accountsInOu = await organizations.listAccountsForParent(ouId);

    // Associate accounts to organizational unit
    awsOuAccountMap[ouId] = accountsInOu;

    // Store the accounts in a simple list as well
    awsAccounts.push(...accountsInOu);
  }

  const awsOusWithPath: OrganizationalUnit[] = [];
  for (const awsOu of awsOus) {
    const ouWithPath = await organizations.getOrganizationalUnitWithPath(awsOu.Id!);
    awsOusWithPath.push({
      ouArn: ouWithPath.Arn!,
      ouId: ouWithPath.Id!,
      ouName: ouWithPath.Name!,
      ouPath: ouWithPath.Path,
    });
  }

  // Store the discovered accounts and OUs in these objects
  const configurationAccounts: ConfigurationAccount[] = [];
  const configurationOus: OrganizationalUnit[] = [];

  // Verify that AWS Account and Accelerator config have the same OUs
  const acceleratorOuConfigs = config['organizational-units'];
  const acceleratorOus = Object.keys(acceleratorOuConfigs);
  for (const acceleratorOu of acceleratorOus) {
    const awsOu = awsOusWithPath.find(ou => ou.ouName === acceleratorOu);
    if (!awsOu) {
      continue;
    }
    configurationOus.push({
      ouId: awsOu.ouId,
      ouName: awsOu.ouName,
      ouArn: awsOu.ouArn,
      ouPath: awsOu.ouPath,
    });
  }

  const workLoadOuConfigs = config.getWorkloadAccountConfigs();
  const workLoadOus = workLoadOuConfigs.map(([_, wc]) => wc['ou-path'] || wc.ou);
  for (const acceleratorOu of workLoadOus) {
    if (configurationOus.find(co => co.ouPath === acceleratorOu)) {
      // Skipp as it is already added in organizational-units
      continue;
    }
    let awsOu = awsOusWithPath.find(ou => ou.ouPath === acceleratorOu);
    if (!awsOu) {
      awsOu = awsOusWithPath.find(ou => ou.ouName === acceleratorOu);
    }
    if (!awsOu) {
      continue;
    }
    configurationOus.push(awsOu);
  }

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const accountConfigName = accountConfig['account-name'];
    const accountConfigEmail = accountConfig.email;

    // Find the organizational account used by this
    const organizationalUnitName = accountConfig.ou;
    const organizationalUnitPath = accountConfig['ou-path'] || organizationalUnitName;
    let organizationalUnit = awsOusWithPath.find(ou => ou.ouPath === organizationalUnitPath);
    if (!organizationalUnit) {
      organizationalUnit = awsOusWithPath.find(ou => ou.ouName === organizationalUnitName);
    }
    if (!organizationalUnit) {
      continue;
    }

    const account = awsAccounts.find(a => equalIgnoreCase(a.Email!, accountConfigEmail));
    if (account) {
      const accountsInOu = awsOuAccountMap[organizationalUnit.ouId];
      const accountInOu = accountsInOu?.find(a => a.Id === account.Id);
      if (!accountInOu) {
        continue;
      }
    }

    configurationAccounts.push({
      accountId: account?.Id,
      accountKey,
      accountName: accountConfigName,
      emailAddress: accountConfig.email,
      organizationalUnit: organizationalUnitName,
      ouPath: organizationalUnitPath,
    });
  }

  return {
    organizationalUnits: configurationOus,
    accounts: configurationAccounts,
  };
}
