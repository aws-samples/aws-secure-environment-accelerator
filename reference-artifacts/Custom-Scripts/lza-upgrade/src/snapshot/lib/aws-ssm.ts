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
  SSMClient,
  AccountSharingInfo,
  DescribeDocumentCommand,
  DescribeDocumentCommandOutput,
  DescribeDocumentPermissionCommand,
  DocumentDescription,
  InvalidDocument,
  ListDocumentsCommand,
} from '@aws-sdk/client-ssm';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

export async function describeSessionManagerDocument(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SSMClient;
  if (credentials) {
    serviceClient = new SSMClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SSMClient({ region: region });
  }
  let results: DescribeDocumentCommandOutput;
  try {
    results = await throttlingBackOff(() =>
      serviceClient.send(new DescribeDocumentCommand({ Name: 'SSM-SessionManagerRunShell' })),
    );
  } catch (e) {
    if (e instanceof InvalidDocument) {
      return { jsonData: '{}', hash: computeHash('{}') };
    } else {
      console.log(JSON.stringify(e));
      throw new Error('Failed to lookup Session Manager Document');
    }
  }
  const jsonResults = await stringify(results.Document, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function describeSsmDocuments(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SSMClient;
  if (credentials) {
    serviceClient = new SSMClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SSMClient({ region: region });
  }

  let documents: DocumentDescription[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(
        new ListDocumentsCommand({ Filters: [{ Key: 'Owner', Values: ['Self'] }], NextToken: nextToken }),
      ),
    );
    nextToken = results.NextToken;
    if (results.DocumentIdentifiers) {
      for (const document of results.DocumentIdentifiers) {
        const describeDocumentResult = await throttlingBackOff(() =>
          serviceClient.send(new DescribeDocumentCommand({ Name: document.Name })),
        );
        documents.push(describeDocumentResult.Document!);
      }
    }
  } while (nextToken);

  const jsonResults = await stringify(documents, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function describeSsmDocumentPermissions(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: SSMClient;
  if (credentials) {
    serviceClient = new SSMClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new SSMClient({ region: region });
  }

  let permissions: {
    DocumentName: string;
    AccountIds: string[];
    AccountSharingInfoList: AccountSharingInfo[];
  }[] = [];

  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(
        new ListDocumentsCommand({ Filters: [{ Key: 'Owner', Values: ['Self'] }], NextToken: nextToken }),
      ),
    );
    nextToken = results.NextToken;
    if (results.DocumentIdentifiers) {
      for (const document of results.DocumentIdentifiers) {
        const describeDocumentPermissionResult = await throttlingBackOff(() =>
          serviceClient.send(new DescribeDocumentPermissionCommand({ Name: document.Name, PermissionType: 'Share' })),
        );
        permissions.push({
          DocumentName: document.Name!,
          AccountIds: describeDocumentPermissionResult.AccountIds!,
          AccountSharingInfoList: describeDocumentPermissionResult.AccountSharingInfoList!,
        });
      }
    }
  } while (nextToken);

  const jsonResults = await stringify(permissions, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
