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
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  vpcId: string;
  resolverRuleIds: string[];
}

const route53Resolver = new AWS.Route53Resolver();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Associating HostedZones to VPC..`);
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
  const { resolverRuleIds, vpcId } = properties;
  for (const ruleId of resolverRuleIds) {
    try {
      await throttlingBackOff(() =>
        route53Resolver
          .associateResolverRule({
            ResolverRuleId: ruleId,
            VPCId: vpcId,
          })
          .promise(),
      );
    } catch (error) {
      if (error.code === 'ResourceExistsException') {
        console.warn(`Resolver Rule ${ruleId} is already Associated to ${vpcId}`);
      } else {
        console.error(`Error while Associating Resolver Rule "${ruleId}" to VPC ${vpcId}`);
        console.error(error);
        throw new Error(error);
      }
    }
  }
  return {
    physicalResourceId: `AssociateResolverRules-${vpcId}`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { resolverRuleIds, vpcId } = properties;

  const oldProperties = (event.OldResourceProperties as unknown) as HandlerProperties;
  const newAssociations = resolverRuleIds.filter(rule => !oldProperties.resolverRuleIds.includes(rule));
  const removeAssociations = oldProperties.resolverRuleIds.filter(rule => !resolverRuleIds.includes(rule));
  for (const ruleId of newAssociations) {
    try {
      await throttlingBackOff(() =>
        route53Resolver
          .associateResolverRule({
            ResolverRuleId: ruleId,
            VPCId: vpcId,
          })
          .promise(),
      );
    } catch (error) {
      if (error.code === 'ResourceExistsException') {
        console.warn(`Resolver Rule ${ruleId} is already Associated to ${vpcId}`);
      } else {
        console.error(`Error while Associating Resolver Rule "${ruleId}" to VPC ${vpcId}`);
        console.error(error);
        throw new Error(error);
      }
    }
  }

  for (const ruleId of removeAssociations) {
    try {
      await throttlingBackOff(() =>
        route53Resolver
          .disassociateResolverRule({
            ResolverRuleId: ruleId,
            VPCId: vpcId,
          })
          .promise(),
      );
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        console.warn(`Resolver Rule ${ruleId} is not Associated to ${vpcId}`);
      } else {
        console.error(`Error while Disassociate VPC "${vpcId}" from Resolver Rule "${ruleId}"`);
        console.error(error);
        throw new Error(error);
      }
    }
  }

  return {
    physicalResourceId: `AssociateResolverRules-${vpcId}`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting Log Group Metric filter...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { resolverRuleIds, vpcId } = properties;
  if (event.PhysicalResourceId !== `AssociateResolverRules-${vpcId}`) {
    return;
  }
  for (const ruleId of resolverRuleIds) {
    try {
      await throttlingBackOff(() =>
        route53Resolver
          .disassociateResolverRule({
            ResolverRuleId: ruleId,
            VPCId: vpcId,
          })
          .promise(),
      );
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        console.warn(`Resolver Rule ${ruleId} is not Associated to ${vpcId}`);
      } else {
        console.error(error);
      }
    }
  }
}
