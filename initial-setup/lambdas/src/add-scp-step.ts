import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { ConfigurationOrganizationalUnit, LoadConfigurationInput } from './load-configuration-step';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { ArtifactOutputFinder } from '@aws-pbmm/common-outputs/lib/artifacts';
import { ServiceControlPolicy } from '@aws-pbmm/common-lambda/lib/scp';

interface AddScpInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  accounts: Account[];
  organizationalUnits: ConfigurationOrganizationalUnit[];
  stackOutputSecretId: string;
}

export const handler = async (input: AddScpInput) => {
  console.log(`Adding service control policy to organization...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    acceleratorPrefix,
    accounts,
    organizationalUnits,
    configRepositoryName,
    configFilePath,
    configCommitId,
    stackOutputSecretId,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const scps = new ServiceControlPolicy(acceleratorPrefix);

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  // Find the SCP artifact output
  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'SCP',
  });
  const scpBucketName = artifactOutput.bucketName;
  const scpBucketPrefix = artifactOutput.keyPrefix;

  // Find policy config
  const globalOptionsConfig = config['global-options'];
  const policyConfigs = globalOptionsConfig.scps;

  // Keep track of Accelerator policy names so we later can detach all non-Accelerator policies
  const acceleratorPolicies = await scps.createPoliciesFromConfiguration({
    acceleratorPrefix,
    scpBucketName,
    scpBucketPrefix,
    policyConfigs,
  });
  const acceleratorPolicyNames = acceleratorPolicies.map(p => p.Name!);

  // Query all the existing policies
  const existingPolicies = await scps.listScps();

  // Find roots to attach FullAWSAccess
  const rootIds = await scps.organizationRoots();

  // Find Accelerator accounts and OUs to attach FullAWSAccess
  const acceleratorOuIds = organizationalUnits.map(ou => ou.ouId);
  const acceleratorAccountIds = accounts.map(a => a.id);
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

  return {
    status: 'SUCCESS',
  };
};
