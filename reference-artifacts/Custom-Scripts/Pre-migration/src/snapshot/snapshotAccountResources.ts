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

import { getAccessAnalyzer } from './lib/aws-access-analyzer';
import { describeAggregator } from './lib/aws-config';
import { getFmsNotificationChannel } from './lib/aws-fms';
import { getGuardDutyPublishingDestinations, describeGuardDutyOrganizationConfig } from './lib/aws-guardduty';
import { getAccountPasswordPolicy, getIamRoles } from './lib/aws-iam';
import { getMacieClassicationScopes, getMacieOrganizationConfig } from './lib/aws-macie';
import { getS3PublicAccessBlock, snapshotS3Resources } from './lib/aws-s3';
import { getSecurityHubOrganizationConfig } from './lib/aws-securityhub';

import { TableOperations } from './common/dynamodb';

export async function snapshotAccountResources(
  tableName: string,
  homeRegion: string,
  prefix: string,
  accountId: string,
  preMigration: boolean,
  credentials: AwsCredentialIdentity | undefined,
) {
  const region = 'us-east-1';
  const snapshotTable = new TableOperations(tableName, homeRegion);
  // config aggregator
  const aggregatorResults = await describeAggregator(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'config-aggregators',
    preMigration: preMigration,
    data: aggregatorResults,
  });

  // s3 account public access block
  const s3PublicAccessBlockResults = await getS3PublicAccessBlock(accountId, region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'account-s3-public-access-block',
    preMigration: preMigration,
    data: s3PublicAccessBlockResults,
  });

  // account password policy
  const accountPasswordPolicy = await getAccountPasswordPolicy(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'account-password-policy',
    preMigration: preMigration,
    data: accountPasswordPolicy,
  });

  // account access analyzer
  const accessAnalyzer = await getAccessAnalyzer(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'account-access-analyzer',
    preMigration: preMigration,
    data: accessAnalyzer,
  });

  // guardduty publishing destinations
  const guarddutyPublishingDestinationResults = await getGuardDutyPublishingDestinations(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'guardduty-publishing-destinations',
    preMigration: preMigration,
    data: guarddutyPublishingDestinationResults,
  });

  // guardduty organization config
  const guarddutyOrganizationConfigResults = await describeGuardDutyOrganizationConfig(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'guardduty-organization-config',
    preMigration: preMigration,
    data: guarddutyOrganizationConfigResults,
  });

  // securityhub organization config
  const securityhubOrganizationConfigResults = await getSecurityHubOrganizationConfig(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'securityhub-organization-config',
    preMigration: preMigration,
    data: securityhubOrganizationConfigResults,
  });

  // iam roles
  //const iamRoles = await getIamRoles(prefix, region, credentials);
  const iamRoles = await getIamRoles(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'iam-roles',
    preMigration: preMigration,
    data: iamRoles,
  });

  // macie organization config
  const macieOrganizationConfigResults = await getMacieOrganizationConfig(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'macie-organization-config',
    preMigration: preMigration,
    data: macieOrganizationConfigResults,
  });

  // macie classification scopes
  const macieClassificationScopesResults = await getMacieClassicationScopes(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'macie-classification-scopes',
    preMigration: preMigration,
    data: macieClassificationScopesResults,
  });

  // fms notification channel
  const fmsnotificationChannelResults = await getFmsNotificationChannel(region, credentials);
  await snapshotTable.writeResource({
    accountId: accountId,
    region: region,
    resourceName: 'fms-notification-channel',
    preMigration: preMigration,
    data: fmsnotificationChannelResults,
  });

  // s3 resources
  await snapshotS3Resources(tableName, homeRegion, prefix, accountId, region, preMigration, credentials);
}
