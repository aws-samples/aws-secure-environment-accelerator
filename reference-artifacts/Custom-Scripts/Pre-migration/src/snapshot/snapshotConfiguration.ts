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

import { Account, OrganizationsClient, ListAccountsCommand } from '@aws-sdk/client-organizations';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../common/aws/backoff';
import { TableOperations } from './common/dynamodb';
import { regions } from './common/types';
import { snapshotAccountResources } from './snapshotAccountResources';
import { snapshotGlobalResources } from './snapshotGlobalResources';
import { snapshotRegionResources } from './snapshotRegionalResources';

let snapshotTable: TableOperations;
let stsClient: STSClient;

export async function snapshotConfiguration(
  tableName: string,
  homeRegion: string,
  roleName: string,
  prefix: string,
  preMigration: boolean,
) {
  stsClient = new STSClient({});

  // setup DynamoDb
  snapshotTable = new TableOperations(tableName, homeRegion);
  await snapshotTable.createTable();

  const identityResponse = await throttlingBackOff(() => stsClient.send(new GetCallerIdentityCommand({})));
  const currentAccountId = identityResponse.Account;

  // process global services
  await snapshotGlobalResources(tableName, homeRegion, currentAccountId!, preMigration, undefined);

  const accounts = await getAccountList();
  // process account services
  for (const account of accounts) {
    const accountPromises = [];
    if (account.Status !== 'SUSPENDED') {
      if (account.Id !== currentAccountId) {
        const credentials = await getCredentials(account.Id!, roleName);
        accountPromises.push(
          snapshotAccountResources(tableName, homeRegion, prefix, account.Id!, preMigration, credentials),
        );
      } else {
        accountPromises.push(
          snapshotAccountResources(tableName, homeRegion, prefix, account.Id!, preMigration, undefined),
        );
      }
      await Promise.all(accountPromises);
    }
  }

  // process regional services
  for (const account of accounts) {
    const regionPromises = [];
    for (const region of regions) {
      if (account.Status !== 'SUSPENDED') {
        if (account.Id !== currentAccountId) {
          const credentials = await getCredentials(account.Id!, roleName);
          regionPromises.push(
            snapshotRegionResources(tableName, homeRegion, prefix, account.Id!, region, preMigration, credentials),
          );
        } else {
          regionPromises.push(
            snapshotRegionResources(tableName, homeRegion, prefix, account.Id!, region, preMigration, undefined),
          );
        }
      }
    }
    await Promise.all(regionPromises);
  }
}

async function getCredentials(accountId: string, roleName: string): Promise<AwsCredentialIdentity> {
  const stsResponse = await stsClient.send(
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
}

async function getAccountList(): Promise<Account[]> {
  const organizationsClient = new OrganizationsClient({ region: 'us-east-1' });

  const accounts: Account[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.Accounts) {
      accounts.push(...results.Accounts);
    }
  } while (nextToken);

  return accounts;
}
