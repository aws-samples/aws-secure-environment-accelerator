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

import { ConfigServiceClient, DescribeConfigurationAggregatorsCommand } from '@aws-sdk/client-config-service';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { SnapshotData } from '../common/types';
import { computeHash } from '../common/hash';
import { throttlingBackOff } from '../../common/aws/backoff';

const stringify = require('fast-json-stable-stringify');

export async function describeAggregator(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: ConfigServiceClient;
  if (credentials) {
    serviceClient = new ConfigServiceClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new ConfigServiceClient({ region: region });
  }
  const results = await throttlingBackOff(() => serviceClient.send(new DescribeConfigurationAggregatorsCommand({})));

  const jsonResults = await stringify(results.ConfigurationAggregators, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
