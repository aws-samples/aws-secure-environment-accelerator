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

import { ACMClient, CertificateSummary, ListCertificatesCommand } from '@aws-sdk/client-acm';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

export async function describeCertificates(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: ACMClient;
  if (credentials) {
    serviceClient = new ACMClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new ACMClient({ region: region });
  }

  const acmCertificates: CertificateSummary[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new ListCertificatesCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.CertificateSummaryList) {
      acmCertificates.push(...results.CertificateSummaryList);
    }
  } while (nextToken);

  const jsonResults = await stringify(acmCertificates, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
