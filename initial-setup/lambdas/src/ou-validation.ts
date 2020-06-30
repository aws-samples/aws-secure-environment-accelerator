import * as org from 'aws-sdk/clients/organizations';
import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import {
  ServiceControlPolicy,
  FULL_AWS_ACCESS_POLICY_NAME,
  createQuarantineScpName,
} from '@aws-pbmm/common-lambda/lib/scp';

export interface ValdationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  acceleratorPrefix: string;
}

const organizations = new Organizations();

export const handler = async (input: ValdationInput): Promise<string> => {
  console.log(`Loading Organization baseline configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const { configFilePath, configRepositoryName, configCommitId, acceleratorPrefix } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const scps = new ServiceControlPolicy(acceleratorPrefix, organizations);

  // Find OUs and accounts in AWS account
  const awsOus = await organizations.listOrganizationalUnits();

  const awsOuAccountMap: { [ouId: string]: org.Account[] } = {};
  const awsAccounts: org.Account[] = [];
  const awsOusWithPath: OrganizationalUnit[] = [];
  for (const awsOu of awsOus) {
    awsOusWithPath.push(await organizations.getOrganizationalUnitWithPath(awsOu.Id!));
  }

  for (const organizationalUnit of awsOusWithPath) {
    const ouId = organizationalUnit.Id!;
    const accountsInOu = await organizations.listAccountsForParent(ouId);

    // Associate accounts to organizational unit
    awsOuAccountMap[ouId] = accountsInOu;

    // Store the accounts in a simple list as well
    awsAccounts.push(...accountsInOu);
  }

  console.log(`Found organizational units:`);
  console.log(JSON.stringify(awsOusWithPath, null, 2));
  const roots = await organizations.listRoots();
  const rootId = roots[0].Id!;
  await createOrganizstionalUnits(config, awsOusWithPath, rootId);

  const suspendedOuName = 'Suspended';
  let suspendedOu = awsOusWithPath.find(o => o.Path === suspendedOuName);
  if (!suspendedOu) {
    suspendedOu = await createSuspendedOu(suspendedOuName, rootId);
  }

  // List Suspended Accounts
  // TODO Testing
  for (const [ouId, accounts] of Object.entries(awsOuAccountMap)) {
    const suspendedAccounts = accounts.filter(account => account.Status === 'SUSPENDED');
    for (const suspendedAccount of suspendedAccounts) {
      await organizations.moveAccount({
        AccountId: suspendedAccount.Id!,
        DestinationParentId: suspendedOu.Id!,
        SourceParentId: ouId,
      });
    }
  }
  // Attach Qurantine SCP to root Accounts
  const policyId = await scps.createOrUpdateQuarantineScp();
  const rootAccounts = await organizations.listAccountsForParent(rootId);
  const rootAccountIds = rootAccounts.map(acc => acc.Id);
  // Detach target from all polocies except FullAccess and Qurantine SCP
  for (const targetId of [...rootAccountIds, suspendedOu.Id]) {
    await scps.detachPoliciesFromTargets({
      policyNamesToKeep: [createQuarantineScpName({ acceleratorPrefix }), FULL_AWS_ACCESS_POLICY_NAME],
      policyTargetIdsToInclude: [targetId!],
    });
  }
  const policyTargets = await organizations.listTargetsForPolicy({
    PolicyId: policyId,
  });
  const existingTargets = policyTargets.map(target => target.TargetId);
  const targetIds = rootAccountIds.filter(targetId => !existingTargets.includes(targetId));
  if (!existingTargets.includes(suspendedOu.Id)) {
    targetIds.push(suspendedOu.Id);
  }
  for (const targetId of targetIds) {
    await organizations.attachPolicy(policyId, targetId!);
  }
  return '';
};

async function createSuspendedOu(suspendedOuName: string, rootId: string): Promise<OrganizationalUnit> {
  const suspendedOu = await organizations.createOrganizationalUnit(suspendedOuName, rootId);
  return {
    ...suspendedOu,
    Path: suspendedOuName,
  };
}

async function createOrganizstionalUnits(
  config: AcceleratorConfig,
  awsOusWithPath: OrganizationalUnit[],
  rootId: string,
) {
  const acceleratorOuConfigs = config['organizational-units'];
  const acceleratorOus = Object.keys(acceleratorOuConfigs);
  for (const acceleratorOu of acceleratorOus) {
    const awsOu = awsOusWithPath.find(ou => ou.Name === acceleratorOu);
    if (!awsOu) {
      // Create Missing OrganizationalUnit
      const orgUnit = await organizations.createOrganizationalUnit(acceleratorOu, rootId);
      awsOusWithPath.push({
        ...orgUnit,
        Path: acceleratorOu,
      });
    }
  }

  const acceleratorWorkLoadAccountConfigs = config.getWorkloadAccountConfigs();
  for (const [_, workLoadOu] of acceleratorWorkLoadAccountConfigs) {
    const ouPath = workLoadOu['ou-path']!;
    if (!ouPath) {
      const existingOu = awsOusWithPath.find(o => o.Path === workLoadOu.ou);
      if (!existingOu) {
        console.log(`Creating new Organizational Unit "${workLoadOu.ou}" under Root`);
        const orgUnit = await organizations.createOrganizationalUnit(workLoadOu.ou, rootId);
        awsOusWithPath.push({
          ...orgUnit,
          Path: workLoadOu.ou,
        });
        continue;
      }
    } else {
      const ous = ouPath.split('/');
      let localParent = rootId;
      for (let i = 0; i < ous.length; i++) {
        const currentOuPath = ous.slice(0, i + 1).join('/');
        const existingOu = awsOusWithPath.find(o => o.Path === currentOuPath);
        let orgUnit: org.OrganizationalUnit | undefined;
        if (!existingOu) {
          console.log(`Creating OrganizationalUnit "${ous[i]}" under Parent ${currentOuPath} and id ${localParent}`);
          orgUnit = await organizations.createOrganizationalUnit(ous[i], localParent);
          awsOusWithPath.push({
            ...orgUnit,
            Path: currentOuPath,
          });
        } else {
          orgUnit = existingOu;
        }
        localParent = orgUnit?.Id!;
      }
    }
  }
}
