/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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

  const rootOrg = await organizations.describeOrganization();
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
      rootOrgId: rootOrg?.Id,
    });
  }

  // Store the organizations into the dynamodb
  await dynamoDB.updateItem(getUpdateItemInput(parametersTableName, itemId, JSON.stringify(organizationalUnits)));

  // Find all relevant accounts in the organization
  return organizationalUnits;
};
