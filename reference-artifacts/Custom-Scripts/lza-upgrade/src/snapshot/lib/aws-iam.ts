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

import { GetAccountPasswordPolicyCommand, IAMClient, ListRolesCommand, Role } from '@aws-sdk/client-iam';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

export async function getAccountPasswordPolicy(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: IAMClient;
  if (credentials) {
    serviceClient = new IAMClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new IAMClient({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new GetAccountPasswordPolicyCommand({})));
  const jsonResults = stringify(results.PasswordPolicy, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getIamRoles(
  //prefix: string,
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: IAMClient;
  if (credentials) {
    serviceClient = new IAMClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new IAMClient({ region: region });
  }

  const iamRoles: Role[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() => serviceClient.send(new ListRolesCommand({ Marker: nextToken })));
    nextToken = results.Marker;
    if (results.Roles) {
      for (const role of results.Roles) {
        //TODO: use prefix
        if (role.RoleName?.startsWith('ASEA') || role.RoleName === 'CloudWatch-CrossAccountDataSharingRole') {
          iamRoles.push(role);
        }
      }
    }
  } while (nextToken);

  const jsonResults = stringify(iamRoles, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
