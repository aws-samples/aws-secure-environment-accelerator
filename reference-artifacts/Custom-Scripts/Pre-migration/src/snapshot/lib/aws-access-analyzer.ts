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
  AccessAnalyzerClient,
  GetAnalyzerCommand,
  GetAnalyzerCommandOutput,
  ResourceNotFoundException,
} from '@aws-sdk/client-accessanalyzer';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { SnapshotData } from '../common/types';
import { computeHash } from '../common/hash';
import { throttlingBackOff } from '../../common/aws/backoff';

const stringify = require('fast-json-stable-stringify');

export async function getAccessAnalyzer(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: AccessAnalyzerClient;
  if (credentials) {
    serviceClient = new AccessAnalyzerClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new AccessAnalyzerClient({ region: region });
  }

  let modifiedResults: {
    arn: string;
    name: string;
    type: string;
    createdAt: Date;
    status: string;
  };

  let results: GetAnalyzerCommandOutput;
  try {
    results = await throttlingBackOff(() =>
      serviceClient.send(new GetAnalyzerCommand({ analyzerName: 'AccessAnalyzer' })),
    );
  } catch (e: any) {
    if (e instanceof ResourceNotFoundException) {
      const jsonResults = await stringify({}, { space: 1 });
      const hash = computeHash(jsonResults);
      return { jsonData: jsonResults, hash: hash };
    } else {
      console.log(JSON.stringify(e));
      throw new Error('Unable to describe access analyzer');
    }
  }

  // remove data that isn't configuration
  // and could change hash
  modifiedResults = {
    arn: results.analyzer?.arn!,
    name: results.analyzer?.name!,
    type: results.analyzer?.type!,
    createdAt: results.analyzer?.createdAt!,
    status: results.analyzer?.status!,
  };

  const jsonResults = await stringify(modifiedResults, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
