import { ConfigurationAccount, LoadConfigurationInput } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-pbmm/common-lambda/lib/aws/types/account';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { createPoliciesFromConfiguration, policyNameToAcceleratorPolicyName } from './../add-scp-step';
import * as org from 'aws-sdk/clients/organizations';
import { QuarantineScpName } from '@aws-pbmm/common-outputs/lib/accounts';

interface AddQuarantineScpInput extends LoadConfigurationInput {
  account: ConfigurationAccount;
  acceleratorPrefix: string;
  scpBucketName: string;
  scpBucketPrefix: string;
}

const organizations = new Organizations();
export const handler = async (input: AddQuarantineScpInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    acceleratorPrefix,
    scpBucketName,
    scpBucketPrefix,
    account,
    configRepositoryName,
    configFilePath,
    configCommitId,
  } = input;

  if (!account.accountId) {
    return {
      status: 'FAILED',
      statusReason: `Skipping adding SCP of account "${account.accountKey}"`,
    };
  }

  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  // Find policy config
  const globalOptionsConfig = config['global-options'];
  const policyConfigs = globalOptionsConfig.scps;

  const quarantineScps = policyConfigs.filter(scp => scp.name === QuarantineScpName);

  // Find all policies in the organization
  const existingPolicies = await organizations.listPolicies({
    Filter: 'SERVICE_CONTROL_POLICY',
  });
  const policyName = policyNameToAcceleratorPolicyName({
    acceleratorPrefix,
    policyName: QuarantineScpName,
  });
  const existingPolicy = existingPolicies.find(p => p.Name === policyName);
  let acceleratorPolicy: org.PolicySummary;
  if (!existingPolicy) {
    // Create quarantineScps if not exists and attach AccountId to Policy
    const policies = await createPoliciesFromConfiguration({
      acceleratorPrefix,
      scpBucketName,
      scpBucketPrefix,
      policyConfigs: quarantineScps,
    });
    acceleratorPolicy = policies[0];
  } else {
    acceleratorPolicy = existingPolicy;
  }
  console.log(`Attaching account "${account.accountId}" to SCP "${policyName}"`);
  await organizations.attachPolicy(acceleratorPolicy.Id!, account.accountId);

  return {
    status: 'SUCCESS',
    provisionToken: `Account "${account.accountId}" Successfully attached to Quarantine SCP`,
  };
};
