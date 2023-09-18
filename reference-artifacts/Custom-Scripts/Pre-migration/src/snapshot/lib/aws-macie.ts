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

import {
  AccessDeniedException,
  DescribeOrganizationConfigurationCommand,
  DescribeOrganizationConfigurationCommandOutput,
  GetClassificationExportConfigurationCommand,
  GetClassificationScopeCommand,
  GetClassificationScopeCommandOutput,
  GetMacieSessionCommand,
  ListClassificationScopesCommand,
  ListClassificationScopesCommandOutput,
  ListOrganizationAdminAccountsCommand,
  Macie2Client,
} from '@aws-sdk/client-macie2';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

export async function getMacieOrganizationAdminAccounts(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Macie2Client;
  if (credentials) {
    serviceClient = new Macie2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new Macie2Client({ region: region });
  }
  let jsonResults: string = '{}';
  try {
    const results = await throttlingBackOff(() => serviceClient.send(new ListOrganizationAdminAccountsCommand({})));
    jsonResults = await stringify(results.adminAccounts, { space: 1 });
  } catch (e: any) {
    if (e.name === 'AccessDeniedException') {
      // catch exception if not enabled
    }
  }
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getMacieStatus(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Macie2Client;
  if (credentials) {
    serviceClient = new Macie2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new Macie2Client({ region: region });
  }
  let jsonResults: string = '{}';
  try {
    const results = await throttlingBackOff(() => serviceClient.send(new GetMacieSessionCommand({})));
    jsonResults = await stringify(
      {
        createdAt: results.createdAt,
        findingPublishingFrequency: results.findingPublishingFrequency,
        serviceRole: results.serviceRole,
        status: results.status,
      },
      { space: 1 },
    );
  } catch (e: any) {
    if (e.name === 'AccessDeniedException') {
      // catch exception if not enabled
    }
  }
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getMacieExportConfig(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Macie2Client;
  if (credentials) {
    serviceClient = new Macie2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new Macie2Client({ region: region });
  }
  let jsonResults: string = '{}';
  try {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new GetClassificationExportConfigurationCommand({})),
    );
    jsonResults = await stringify(results.configuration, { space: 1 });
  } catch (e: any) {
    if (e.name === 'AccessDeniedException') {
      // catch exception if not enabled
    }
  }
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getMacieOrganizationConfig(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Macie2Client;
  if (credentials) {
    serviceClient = new Macie2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new Macie2Client({ region: region });
  }
  let results: DescribeOrganizationConfigurationCommandOutput | undefined;
  let jsonResults: string = '{}';
  try {
    results = await throttlingBackOff(() => serviceClient.send(new DescribeOrganizationConfigurationCommand({})));
    if (results) {
      jsonResults = await stringify(results.autoEnable, { space: 1 });
    }
  } catch (e) {
    if (e instanceof AccessDeniedException) {
      // catch exception if not organization admin account
    }
  }
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getMacieClassicationScopes(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Macie2Client;
  if (credentials) {
    serviceClient = new Macie2Client({ region: region, credentials: credentials });
  } else {
    serviceClient = new Macie2Client({ region: region });
  }
  type Scope = Omit<GetClassificationScopeCommandOutput, '$metadata'>;
  const results: Scope[] = [];

  let listScopesResults: ListClassificationScopesCommandOutput | undefined = undefined;
  let jsonResults: string = '{}';
  try {
    listScopesResults = await throttlingBackOff(() => serviceClient.send(new ListClassificationScopesCommand({})));
    for (const scope of listScopesResults!.classificationScopes!) {
      const scopeResults = await serviceClient.send(new GetClassificationScopeCommand({ id: scope.id }));
      results.push({ id: scopeResults.id, name: scopeResults.name, s3: scopeResults.s3 });
    }
    jsonResults = await stringify(results, { space: 1 });
  } catch (e) {
    if (e instanceof AccessDeniedException) {
      //handle exception when not the macie organization account
    }
  }
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
