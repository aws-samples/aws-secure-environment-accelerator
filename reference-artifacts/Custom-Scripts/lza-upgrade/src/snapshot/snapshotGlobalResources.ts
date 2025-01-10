/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { describeCostUsageReporting } from './lib/aws-cur';
import { getGuardDutyOrganizationAdminAccounts } from './lib/aws-guardduty';
import { getMacieOrganizationAdminAccounts } from './lib/aws-macie';
import { getSecurityHubAdministratorAccount } from './lib/aws-securityhub';

import { TableOperations } from './common/dynamodb';

export async function snapshotGlobalResources(
  tableName: string,
  homeRegion: string,
  accountId: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const snapshotTable = new TableOperations(tableName, homeRegion);
  const region = 'us-east-1';

  // cost and usage reporting
  const costUsageReporting = await describeCostUsageReporting(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'cost-usage-reporting',
    preMigration: preMigration,
    data: costUsageReporting,
  });

  // guardduty admin account
  const guarddutyOrganizationAdminAccounts = await getGuardDutyOrganizationAdminAccounts(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'guardduty-admin-accounts',
    preMigration: preMigration,
    data: guarddutyOrganizationAdminAccounts,
  });

  // macie admin account
  const macieOrganizationAdminAccounts = await getMacieOrganizationAdminAccounts(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'macie-admin-accounts',
    preMigration: preMigration,
    data: macieOrganizationAdminAccounts,
  });

  // securityhub admin account
  const securityhubOrganizationAdminAccount = await getSecurityHubAdministratorAccount(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'securityhub-admin-account',
    preMigration: preMigration,
    data: securityhubOrganizationAdminAccount,
  });
}
