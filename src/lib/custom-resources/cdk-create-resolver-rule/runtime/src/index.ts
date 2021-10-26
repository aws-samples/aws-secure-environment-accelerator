/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { delay, throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  vpcId: string;
  domainName: string;
  targetIps: AWS.Route53Resolver.TargetAddress[];
  resolverEndpointId: string;
  name: string;
}

const route53Resolver = new AWS.Route53Resolver();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create Resolver Rule..`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { targetIps, vpcId, domainName, resolverEndpointId, name } = properties;
  let resolverRuleId: string;
  try {
    const ruleResponse = await throttlingBackOff(() =>
      route53Resolver
        .createResolverRule({
          DomainName: domainName,
          CreatorRequestId: name,
          RuleType: 'FORWARD',
          ResolverEndpointId: resolverEndpointId,
          TargetIps: targetIps,
          Name: name,
        })
        .promise(),
    );
    resolverRuleId = ruleResponse.ResolverRule?.Id!;
  } catch (error) {
    console.error(`Error while Creating Resolver Rule "${name}"`);
    console.error(error);
    throw new Error(error);
  }

  try {
    await throttlingBackOff(() =>
      route53Resolver
        .associateResolverRule({
          ResolverRuleId: resolverRuleId,
          VPCId: vpcId,
        })
        .promise(),
    );
  } catch (error) {
    console.log(error);
  }

  return {
    physicalResourceId: name,
    data: {
      RuleId: resolverRuleId,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { targetIps, domainName, resolverEndpointId, name } = properties;
  let resolverRuleId: string;
  try {
    const ruleResponse = await throttlingBackOff(() =>
      route53Resolver
        .listResolverRules({
          Filters: [
            {
              Name: 'ResolverEndpointId',
              Values: [resolverEndpointId],
            },
            {
              Name: 'DomainName',
              Values: [domainName],
            },
            {
              Name: 'Name',
              Values: [name],
            },
          ],
        })
        .promise(),
    );
    const updateRule = await throttlingBackOff(() =>
      route53Resolver
        .updateResolverRule({
          Config: {
            TargetIps: targetIps,
          },
          ResolverRuleId: ruleResponse.ResolverRules?.[0].Id!,
        })
        .promise(),
    );
    resolverRuleId = updateRule.ResolverRule?.Id!;
  } catch (error) {
    console.error(`Error while Updating Resolver Rule "${name}"`);
    console.error(error);
    throw new Error(error);
  }

  return {
    physicalResourceId: name,
    data: {
      RuleId: resolverRuleId,
    },
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting Resolver Rule...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { resolverEndpointId, name } = properties;
  let maxRetries = 25;
  if (event.PhysicalResourceId !== name) {
    return;
  }
  const resolverRule = await throttlingBackOff(() =>
    route53Resolver
      .listResolverRules({
        Filters: [
          {
            Name: 'ResolverEndpointId',
            Values: [resolverEndpointId],
          },
          {
            Name: 'Name',
            Values: [name],
          },
        ],
      })
      .promise(),
  );
  if (!resolverRule.ResolverRules) {
    return;
  }
  const ruleId = resolverRule.ResolverRules[0].Id;
  if (!ruleId) {
    return;
  }

  let associatedVpcs = await getVpcIds(ruleId);
  for (const vpcId of associatedVpcs! || []) {
    await throttlingBackOff(() =>
      route53Resolver
        .disassociateResolverRule({
          ResolverRuleId: ruleId,
          VPCId: vpcId!,
        })
        .promise(),
    );
  }

  do {
    associatedVpcs = await getVpcIds(ruleId);
    // Waiting to disassociate VPC Ids from the resolver rule
    await delay(5000);
  } while ((associatedVpcs || []).length > 0 && maxRetries-- > 0);

  await throttlingBackOff(() =>
    route53Resolver
      .deleteResolverRule({
        ResolverRuleId: ruleId,
      })
      .promise(),
  );
}

async function getVpcIds(resolverRuleId: string) {
  // Get the vpc associations for the resolver
  const associations = await throttlingBackOff(() =>
    route53Resolver
      .listResolverRuleAssociations({
        Filters: [
          {
            Name: 'ResolverRuleId',
            Values: [resolverRuleId],
          },
        ],
      })
      .promise(),
  );

  const vpcIds = associations.ResolverRuleAssociations?.map(a => a.VPCId);
  return vpcIds;
}
