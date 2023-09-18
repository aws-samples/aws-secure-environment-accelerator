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
  ListResolverRuleAssociationsCommand,
  ListResolverRulesCommand,
  ResolverRule,
  ResolverRuleAssociation,
  Route53ResolverClient,
} from '@aws-sdk/client-route53resolver';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { throttlingBackOff } from '../../common/aws/backoff';
import { computeHash } from '../common/hash';
import { SnapshotData } from '../common/types';

const stringify = require('fast-json-stable-stringify');

export async function getRoute53ResolverRules(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Route53ResolverClient;
  if (credentials) {
    serviceClient = new Route53ResolverClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new Route53ResolverClient({ region: region });
  }

  const resolverRules: ResolverRule[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new ListResolverRulesCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.ResolverRules) {
      resolverRules.push(...results.ResolverRules);
    }
  } while (nextToken);

  const jsonResults = stringify(resolverRules, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}

export async function getRoute53ResolverRuleAssociations(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: Route53ResolverClient;
  if (credentials) {
    serviceClient = new Route53ResolverClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new Route53ResolverClient({ region: region });
  }

  const resolverRuleAssociations: ResolverRuleAssociation[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results = await throttlingBackOff(() =>
      serviceClient.send(new ListResolverRuleAssociationsCommand({ NextToken: nextToken })),
    );
    nextToken = results.NextToken;
    if (results.ResolverRuleAssociations) {
      resolverRuleAssociations.push(...results.ResolverRuleAssociations);
    }
  } while (nextToken);

  const jsonResults = stringify(resolverRuleAssociations, { space: 1 });
  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
