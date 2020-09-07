import { ShortAccount } from '@aws-accelerator/common-outputs/src/accounts';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';
import { LoadConfigurationInput } from './load-configuration-step';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { ArtifactOutputFinder } from '@aws-accelerator/common-outputs/src/artifacts';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';
import { loadOutputs } from './utils/load-outputs';
import { getItemInput } from './utils/dynamodb-requests';

interface AddScpInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  accounts: ShortAccount[];
  outputTableName: string;
  parametersTableName: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: AddScpInput) => {
  console.log(`Adding service control policy to organization...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    acceleratorPrefix,
    accounts,
    configRepositoryName,
    configFilePath,
    configCommitId,
    outputTableName,
    parametersTableName,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const organizationAdminRole = config['global-options']['organization-admin-role']!;
  const scps = new ServiceControlPolicy(acceleratorPrefix, organizationAdminRole);

  const outputs = await loadOutputs(outputTableName, dynamodb);

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

  const organizationsResponse = await dynamodb.getItem(getItemInput(parametersTableName, `organizations`));
  if (!organizationsResponse.Item) {
    throw new Error(`No organizations found in DynamoDB "${parametersTableName}"`);
  }
  const organizationalUnits:OrganizationalUnit[] = JSON.parse(organizationsResponse.Item.value.S!);
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
