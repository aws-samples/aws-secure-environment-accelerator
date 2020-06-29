import * as org from 'aws-sdk/clients/organizations';
import { Organizations, OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { createQuarantineScpContent, createQuarantineScpName } from '@aws-pbmm/common-lambda/lib/util/quarantine-scp';

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

  // Find OUs and accounts in AWS account
  const awsOus = await organizations.listOrganizationalUnits();
  
  const awsOuAccountMap: { [ouId: string]: org.Account[] } = {};
  const awsAccounts: org.Account[] = [];
  const awsOusWithPath: OrganizationalUnit[] = [];
  for (const awsOu of awsOus) {
    awsOusWithPath.push(await organizations.getOrganizationalUnitWithPath(awsOu.Id!));
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
  const accounts = await organizations.listAccounts();
  const suspendedAccounts = accounts.filter(account => account.Status === 'SUSPENDED');
  const suspendedAccountIds = suspendedAccounts.map(account => account.Id);

  // Attach Qurantine SCP to free Accounts
  const policyName = createQuarantineScpName({ acceleratorPrefix });
  const policyContent = createQuarantineScpContent({ acceleratorPrefix });
  const getPolicyByName = await organizations.getPolicyByName({
    Name: policyName,
    Filter: 'SERVICE_CONTROL_POLICY',
  });
  let policyId = getPolicyByName?.PolicySummary?.Id;
  if (policyId) {
    console.log(`Updating policy ${policyName}`);

    if (getPolicyByName?.Content !== policyContent) {
      await organizations.updatePolicy({
        policyId,
        content: policyContent,
      });
    }
  } else {
    console.log(`Creating policy ${policyName}`);

    const response = await organizations.createPolicy({
      type: 'SERVICE_CONTROL_POLICY',
      name: policyName,
      description: `${acceleratorPrefix}Quarantine policy - Apply to ACCOUNTS that need to be quarantined`,
      content: policyContent,
    });
    policyId = response.Policy?.PolicySummary?.Id!;
  }
  const rootAccounts = await organizations.listAccountsForParent(rootId);
  const rootAccountIds = rootAccounts.map(acc => acc.Id);
  const policyTargets = await organizations.listTargetsForPolicy({
    PolicyId: policyId,
  });
  const existingTargets = [...policyTargets.map(target => target.TargetId), ...suspendedAccountIds];
  const targetIds = rootAccountIds.filter(targetId => !existingTargets.includes(targetId));
  for (const targetId of targetIds) {
    await organizations.attachPolicy(policyId, targetId!);
  }
  return '';
};

async function createSuspendedOu(suspendedOuName:string, rootId: string): Promise<OrganizationalUnit> {
  const suspendedOu = await organizations.createOrganizationalUnit(suspendedOuName, rootId);
  return {
    ...suspendedOu,
    Path: suspendedOuName,
  }
}

async function createOrganizstionalUnits(config: AcceleratorConfig, awsOusWithPath: OrganizationalUnit[], rootId: string) {
  const acceleratorOuConfigs = config['organizational-units']
  const acceleratorOus = Object.keys(acceleratorOuConfigs);
  for (const acceleratorOu of acceleratorOus) {
    const awsOu = awsOusWithPath.find(ou => ou.Name === acceleratorOu);
    if (!awsOu) {
      // Create Missing OrganizationalUnit
      const orgUnit = await organizations.createOrganizationalUnit(acceleratorOu, rootId!);
      awsOusWithPath.push({
        ...orgUnit,
        Path: acceleratorOu
      });
    }
  }
  
  const acceleratorWorkLoadAccountConfigs = config.getWorkloadAccountConfigs();
  for (const [accountKey, workLoadOu] of acceleratorWorkLoadAccountConfigs) {
    const ouPath = workLoadOu["ou-path"]!;
    if (!ouPath) {
      const existingOu = awsOusWithPath.find(o => o.Path === workLoadOu.ou);
      if (!existingOu) {
        console.log(`Creating new Organizational Unit "${workLoadOu.ou}" under Root`);
        const orgUnit = await organizations.createOrganizationalUnit(workLoadOu.ou, rootId!);
        awsOusWithPath.push({
          ...orgUnit,
          Path: workLoadOu.ou
        });
        continue;
      }
    } else {
      const ous = ouPath.split('/');
      let localParent = rootId!;
      for (let i = 0; i < ous.length; i++) {
        const currentOuPath = ous.slice(0, i+1).join('/');
        const existingOu = awsOusWithPath.find(o => o.Path === currentOuPath);
        let orgUnit: org.OrganizationalUnit | undefined;
        if (!existingOu) {
          console.log(`Creating OrganizationalUnit "${ous[i]}" under Parent ${currentOuPath} and id ${localParent}`)
          orgUnit = await organizations.createOrganizationalUnit(ous[i], localParent)!;
          awsOusWithPath.push({
            ...orgUnit,
            Path: currentOuPath,
          })
          continue;
        } else {
          orgUnit = existingOu;
        }
        localParent = orgUnit.Id!;
      }
    }
  }
}
// handler({
//   configFilePath: 'config.json',
//   configCommitId: '63d30f462083a894cd0dc30725f53ffac580465d',
//   configRepositoryName: 'PBMMAccel-Config-Repo',
//   acceleratorPrefix: 'PBMMAccel-'
// })
