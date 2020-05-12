import * as org from 'aws-sdk/clients/organizations';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { Account } from './load-accounts-step';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';

interface AddScpInput {
  acceleratorPrefix: string;
  configSecretId: string;
  scpBucketName: string;
  scpBucketPrefix: string;
  accounts: Account[];
}

export const handler = async (input: AddScpInput) => {
  console.log(`Adding service control policy to Organization...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, configSecretId, scpBucketName, scpBucketPrefix, accounts } = input;

  const secrets = new SecretsManager();
  const source = await secrets.getSecret(configSecretId);

  // Load the configuration from Secrets Manager
  const configString = source.SecretString!;
  const config = AcceleratorConfig.fromString(configString);

  const organizations = new Organizations();
  const orgUnits = await organizations.listOrganizationalUnits();

  const listPoliciesRequest: org.ListPoliciesRequest = {
    Filter: 'SERVICE_CONTROL_POLICY',
  };
  let policiesList = await organizations.listPolicies(listPoliciesRequest);

  const lzPolicyNames: string[] = [];
  const pbmmPolicyNames: string[] = [];

  for (const policy of policiesList) {
    if (policy.Name?.startsWith(acceleratorPrefix)) {
      pbmmPolicyNames.push(policy.Name);
    } else {
      lzPolicyNames.push(policy.Name!);
    }
  }

  const globalOptionsConfig = config['global-options'];
  const scps = globalOptionsConfig.scps;
  for (const scp of scps) {
    let scpContent: string | undefined;
    try {
      const s3 = new S3();
      scpContent = await s3.getObjectBodyAsString({
        Bucket: scpBucketName,
        Key: `${scpBucketPrefix}/${scp.policy}`,
      });
    } catch (e) {
      if (e.message === 'Access Denied') {
        console.error(`Access denied to the SCP file at "s3://${scpBucketName}/${scpBucketPrefix}/${scp.policy}"`);
      }
      throw e;
    }

    const pbmmPolicyName = scp.name.startsWith(acceleratorPrefix) ? scp.name : `${acceleratorPrefix}${scp.name}`;
    if (pbmmPolicyNames.includes(pbmmPolicyName)) {
      const existingPolicy = policiesList.find(x => x.Name === pbmmPolicyName);
      const existingPolicyId = existingPolicy?.Id;

      // minify the JSON before calling updatePolicy
      // as policy max size should be less than 5,120 bytes
      const updatePolicyResponse = await organizations.updatePolicy(
        JSON.stringify(JSON.parse(scpContent)),
        scp.description,
        pbmmPolicyName,
        existingPolicyId!,
      );
      console.log(`SCP - ${pbmmPolicyName} updated`);
    } else {
      // minify the JSON before calling createPolicy
      // as policy max size should be less than 5,120 bytes
      const createPolicyResponse = await organizations.createPolicy(
        JSON.stringify(JSON.parse(scpContent)),
        scp.description,
        pbmmPolicyName,
        'SERVICE_CONTROL_POLICY',
      );
      console.log(`SCP - ${pbmmPolicyName} created`);
    }
  }

  // refresh policies list after creating / updating all policies.
  policiesList = await organizations.listPolicies(listPoliciesRequest);

  const pbmmFullAccessPolicyName = outputKeys.PBMM_FULL_ACCESS_POLICY_NAME;
  const pbmmFullAccessPolicy = policiesList.find(x => x.Name === pbmmFullAccessPolicyName);

  if (!pbmmFullAccessPolicy) {
    throw new Error(`Cannot find policy with name ${pbmmFullAccessPolicyName}`);
  }
  const pbmmFullAccessPolicyId = pbmmFullAccessPolicy.Id;

  const pbmmFullAccessPolicyTargetsRequest: org.ListTargetsForPolicyRequest = {
    PolicyId: pbmmFullAccessPolicyId!,
  };
  const pbmmFullAccessPolicyTargets = await organizations.listTargetsForPolicy(pbmmFullAccessPolicyTargetsRequest);

  // add pbmm-full-access policy to root.
  // add pbmm-full-access policy to all OUs.
  // add pbmm-full-access policy to all accounts.
  const roots = await organizations.listRoots();
  const rootIds = roots.map(r => r.Id);
  const orgUnitIds = orgUnits.map(o => o.Id);
  const accountIds = accounts.map(a => a.id);
  const targetIds = [...rootIds, ...orgUnitIds, ...accountIds];

  for (const targetId of targetIds) {
    const target = pbmmFullAccessPolicyTargets.find(x => x.TargetId === targetId);
    if (!target) {
      await organizations.attachPolicy(pbmmFullAccessPolicyId!, targetId!);
      console.log(`SCP - ${pbmmFullAccessPolicyName} attached to target - ${targetId}`);
    } else {
      console.log(`SCP - ${pbmmFullAccessPolicyName} already attached to target - ${target.Name}`);
    }
  }

  // remove the LZ SCps from every target
  for (const lzPolicyName of lzPolicyNames) {
    const lzPolicy = policiesList.find(x => x.Name === lzPolicyName);
    const lzPolicyId = lzPolicy?.Id;

    const listTargetsForPolicyRequest: org.ListTargetsForPolicyRequest = {
      PolicyId: lzPolicyId!,
    };
    const listTargetsForPolicyResponse = await organizations.listTargetsForPolicy(listTargetsForPolicyRequest);

    for (const target of listTargetsForPolicyResponse) {
      await organizations.detachPolicy(lzPolicyId!, target.TargetId!);
      console.log(`SCP - ${lzPolicyName} detached from target - ${target.Name}`);
    }
  }

  // attach PBMM SCPs to OU
  const orgUnitConfigs = config.getOrganizationalUnits();
  for (const [orgName, orgConfig] of orgUnitConfigs) {
    const orgUnit = orgUnits.find(x => x.Name === orgName);
    const orgUnitId = orgUnit?.Id;

    const orgScpList = orgConfig.scps;

    if (orgScpList.length > 4) {
      throw new Error(`Max allowed SCP per OU is 5. Limit exceeded for OU - ${orgName}`);
    }

    const listPoliciesForTargetRequest: org.ListPoliciesForTargetRequest = {
      Filter: 'SERVICE_CONTROL_POLICY',
      TargetId: orgUnitId!,
    };
    const listPoliciesForTargetResponse = await organizations.listPoliciesForTarget(listPoliciesForTargetRequest);

    for (const orgScp of orgScpList) {
      const pbmmScpName = `${acceleratorPrefix}${orgScp}`;
      const target = listPoliciesForTargetResponse.find(x => x.Name === pbmmScpName);
      const policy = policiesList.find(x => x.Name === pbmmScpName);
      if (!target) {
        await organizations.attachPolicy(policy?.Id!, orgUnitId!);
        console.log(`SCP - ${pbmmScpName} attached to OU - ${orgName}`);
      } else {
        console.log(`SCP - ${pbmmScpName} already attached to OU - ${orgName}`);
      }
    }
  }
  console.log('PBMM SCPs - created/updated/attached to the Org as per config.');

  return {
    status: 'SUCCESS',
    statusReason: 'PBMM SCPs - created/updated/attached to the Org as per config.',
  };
};
