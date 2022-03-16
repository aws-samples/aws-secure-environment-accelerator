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
import { additionalReplacements, replaceDefaults } from '@aws-accelerator/common/src/util/common';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { ArtifactOutputFinder } from '@aws-accelerator/common-outputs/src/artifacts';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';
import { loadOutputs } from './utils/load-outputs';
import { getItemInput } from './utils/dynamodb-requests';
import { loadAccounts } from './utils/load-accounts';
import { loadOrganizations } from './utils/load-organizations';

interface AddScpInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  acceleratorName: string;
  region: string;
  outputTableName: string;
  parametersTableName: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: AddScpInput) => {
  console.log(`Adding service control policy to organization...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    acceleratorPrefix,
    configRepositoryName,
    configFilePath,
    configCommitId,
    outputTableName,
    parametersTableName,
    acceleratorName,
    region,
    baseline,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const organizationAdminRole = config['global-options']['organization-admin-role']!;
  const scps = new ServiceControlPolicy({
    acceleratorPrefix,
    acceleratorName,
    region,
    replacements: config.replacements,
    organizationAdminRole,
  });

  const outputs = await loadOutputs(outputTableName, dynamodb);
  const accounts = await loadAccounts(parametersTableName, dynamodb);
  const organizationalUnits = await loadOrganizations(parametersTableName, dynamodb);

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
    scpBucketName,
    scpBucketPrefix,
    policyConfigs,
  });
  const acceleratorPolicyNames = acceleratorPolicies.map(p => p.Name!);

  // Query all the existing policies
  const existingPolicies = await scps.listScps();

  // Find roots to attach FullAWSAccess
  const rootIds = await scps.organizationRoots();
  const rootOus = organizationalUnits.filter(ou => {
    return !ou.ouPath.includes('/');
  });

  // Find Accelerator accounts and OUs to attach FullAWSAccess
  const acceleratorOuIds = rootOus.map(ou => ou.ouId);
  const acceleratorAccountIds = accounts.map(a => a.id);
  const acceleratorTargetIds = [...rootIds, ...acceleratorOuIds, ...acceleratorAccountIds];
  const acceleratorTargetOuIds = [...rootIds, ...acceleratorOuIds];

  // Detach non-Accelerator policies from Accelerator accounts
  await scps.detachPoliciesFromTargets({
    policyNamesToKeep: acceleratorPolicyNames,
    policyTargetIdsToInclude: acceleratorTargetOuIds,
    baseline,
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
    baseline,
  });

  await scps.attachOrDetachPoliciesToAccounts({
    existingPolicies,
    configurationAccounts: accounts,
    accountConfigs: config.getAccountConfigs(),
    acceleratorPrefix,
  });

  await scps.attachOrDetachPoliciesToAccounts({
    existingPolicies,
    configurationAccounts: accounts,
    accountConfigs: config.getAccountConfigs(),
    acceleratorPrefix,
  });

  return {
    status: 'SUCCESS',
  };
};
