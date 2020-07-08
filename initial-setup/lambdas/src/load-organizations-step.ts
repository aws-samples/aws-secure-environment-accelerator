import { OrganizationalUnit } from '@aws-pbmm/common-outputs/lib/organizations';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { LoadConfigurationInput } from './load-configuration-step';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

export interface LoadOrganizationsInput extends LoadConfigurationInput {
  organizationsSecretId: string;
}

export type LoadOrganizationsOutput = {
  organizationalUnits: OrganizationalUnit[];
};

const secrets = new SecretsManager();
const organizations = new Organizations();

export const handler = async (input: LoadOrganizationsInput): Promise<OrganizationalUnit[]> => {
  console.log('Load Organizations ...');
  console.log(JSON.stringify(input, null, 2));

  const organizationalUnits: OrganizationalUnit[] = [];
  const { organizationsSecretId, configCommitId, configFilePath, configRepositoryName } = input;
  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  // Find OUs and accounts in AWS account
  const awsOus = await organizations.listOrganizationalUnits();
  const ignoredOus = config['global-options']['ignored-ous'];
  for (const awsOu of awsOus) {
    const awsOuWithPath = await organizations.getOrganizationalUnitWithPath(awsOu.Id!);
    if (ignoredOus?.includes(awsOuWithPath.Path)) {
      continue;
    }
    organizationalUnits.push({
      ouId: awsOuWithPath.Id!,
      ouArn: awsOuWithPath.Arn!,
      ouName: awsOuWithPath.Path.split('/')[0],
      ouPath: awsOuWithPath.Path,
    });
  }

  // Store the organizational units configuration in the accounts secret
  await secrets.putSecretValue({
    SecretId: organizationsSecretId,
    SecretString: JSON.stringify(organizationalUnits),
  });

  // Find all relevant accounts in the organization
  return organizationalUnits;
};
