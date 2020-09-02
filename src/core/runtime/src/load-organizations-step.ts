import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';
import { LoadConfigurationInput } from './load-configuration-step';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getUpdateItemInput } from './utils/dynamodb-requests';

export interface LoadOrganizationsInput extends LoadConfigurationInput {
  parametersTableName: string;
  itemId: string;
}

export type LoadOrganizationsOutput = {
  organizationalUnits: OrganizationalUnit[];
};

const organizations = new Organizations();
const dynamoDB = new DynamoDB();

export const handler = async (input: LoadOrganizationsInput): Promise<OrganizationalUnit[]> => {
  console.log('Load Organizations ...');
  console.log(JSON.stringify(input, null, 2));

  const organizationalUnits: OrganizationalUnit[] = [];
  const { configCommitId, configFilePath, configRepositoryName, parametersTableName, itemId } = input;
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

  // Store the organizations into the dynamodb
  await dynamoDB.updateItem(getUpdateItemInput(parametersTableName, itemId, JSON.stringify(organizationalUnits)));

  // Find all relevant accounts in the organization
  return organizationalUnits;
};
