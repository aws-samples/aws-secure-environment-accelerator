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

import { Account, OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';
import { AssumeRoleCommand, AssumeRoleCommandOutput, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { TableOperations } from './common/dynamodb';
import { snapshotAccountResources } from './snapshotAccountResources';
import { snapshotGlobalResources } from './snapshotGlobalResources';
import { snapshotRegionResources } from './snapshotRegionalResources';
import { AcceleratorConfig } from '../asea-config';

let snapshotTable: TableOperations;
let stsClient: STSClient;

export async function snapshotConfiguration(
  tableName: string,
  homeRegion: string,
  roleName: string,
  prefix: string,
  preMigration: boolean,
  aseaConfig: AcceleratorConfig,
) {
  stsClient = new STSClient({ maxAttempts: 10 });

  // setup DynamoDb
  snapshotTable = new TableOperations(tableName, homeRegion);
  await snapshotTable.createTable();

  const identityResponse = await stsClient.send(new GetCallerIdentityCommand({}));
  const currentAccountId = identityResponse.Account;

  // process global services
  await snapshotGlobalResources(tableName, homeRegion, currentAccountId!, preMigration, undefined);

  const accounts = await getAccountList();
  const regions = aseaConfig['global-options']['supported-regions'];
  // process account services
  const accountPromises = [];
  for (const account of accounts) {
    let credentials: AwsCredentialIdentity | undefined = undefined;
    if (account.Status !== 'SUSPENDED') {
      credentials = await getCredentials(account.Id!, roleName);
      if (credentials === undefined) {
        continue;
      }
      accountPromises.push(
        snapshotAccountResources(tableName, homeRegion, prefix, account.Id!, preMigration, credentials),
      );
    }
  }
  await Promise.all(accountPromises);

  // process regional services
  let maxPromises = 0;
  for (const account of accounts) {
    if (account.Status === 'SUSPENDED') {
      continue;
    }
    let credentials: AwsCredentialIdentity | undefined = undefined;
    if (account.Id !== currentAccountId) {
      credentials = await getCredentials(account.Id!, roleName);
    }
    if (credentials === undefined) {
      continue;
    }
    const regionPromises = [];
    for (const region of regions) {
      maxPromises = maxPromises + 1;
      regionPromises.push(
        snapshotRegionResources(tableName, homeRegion, prefix, account.Id!, region, preMigration, credentials),
      );
    }
    if (maxPromises > 16) {
      await Promise.all(regionPromises);
      maxPromises = 0;
    }
  }
}

export async function getCredentials(accountId: string, roleName: string): Promise<AwsCredentialIdentity | undefined> {
  const stsClient = new STSClient({ maxAttempts: 10 });
  let stsResponse: AssumeRoleCommandOutput;
  try {
    stsResponse = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/${roleName}`,
        RoleSessionName: 'CustomResourceSnapshot',
        DurationSeconds: 900,
      }),
    );
    const credentials: AwsCredentialIdentity = {
      accessKeyId: stsResponse.Credentials?.AccessKeyId!,
      secretAccessKey: stsResponse.Credentials?.SecretAccessKey!,
      sessionToken: stsResponse.Credentials?.SessionToken!,
    };
    return credentials;
  } catch (e: any) {
    console.error(`Failed to assume role ${roleName} in account ${accountId}`);
    throw new Error(e);
  }
}

export async function getAccountList(): Promise<Account[]> {
  const organizationsClient = new OrganizationsClient({ region: 'us-east-1', maxAttempts: 10 });

  const accounts: Account[] = [];
  for await (const page of paginateListAccounts({ client: organizationsClient, pageSize: 20 }, {})) {
    accounts.push(...page.Accounts!);
  }

  return accounts;
}
