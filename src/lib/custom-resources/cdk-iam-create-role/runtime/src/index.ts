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
import { CloudFormationCustomResourceDeleteEvent, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const iam = new AWS.IAM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create IAM Role...`);
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

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const rootOuId = event.ResourceProperties.rootOuId;
  try {
    await throttlingBackOff(() =>
      iam
        .getRole({
          RoleName: event.ResourceProperties.roleName,
        })
        .promise(),
    );
    await throttlingBackOff(() =>
      iam
        .updateAssumeRolePolicy({
          RoleName: event.ResourceProperties.roleName,
          PolicyDocument: buildPolicyDocument(event.ResourceProperties.accountIds, rootOuId),
        })
        .promise(),
    );
  } catch (error) {
    if (error.code === 'NoSuchEntity') {
      console.log(error.message);
      const crossRole = await throttlingBackOff(() =>
        iam
          .createRole(
            buildCreateRoleRequest(
              event.ResourceProperties.roleName,
              event.ResourceProperties.accountIds,
              event.ResourceProperties.tagName,
              event.ResourceProperties.tagValue,
              rootOuId,
            ),
          )
          .promise(),
      );
      for (const managedPolicy of event.ResourceProperties.managedPolicies) {
        await throttlingBackOff(() =>
          iam.attachRolePolicy(buildAttachPolicyRequest(crossRole.Role.RoleName, managedPolicy)).promise(),
        );
      }
    }
  }
  return {
    physicalResourceId: `IAM-Role-${event.ResourceProperties.roleName}`,
    data: {},
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Nothing to do for delete...`);
  if (event.PhysicalResourceId !== `IAM-Role-${event.ResourceProperties.roleName}`) {
    return;
  }
  try {
    const policies = await throttlingBackOff(() =>
      iam
        .listAttachedRolePolicies({
          RoleName: event.ResourceProperties.roleName,
        })
        .promise(),
    );
    for (const policy of policies.AttachedPolicies || []) {
      await throttlingBackOff(() =>
        iam
          .detachRolePolicy({
            PolicyArn: policy.PolicyArn!,
            RoleName: event.ResourceProperties.roleName,
          })
          .promise(),
      );
    }

    await throttlingBackOff(() =>
      iam
        .deleteRole({
          RoleName: event.ResourceProperties.roleName,
        })
        .promise(),
    );
  } catch (error) {
    console.warn('Exception while delete role', event.ResourceProperties.roleName);
    console.warn(error);
  }
}

function buildCreateRoleRequest(
  roleName: string,
  accountIds: string[],
  tagName: string,
  tagValue: string,
  rootOuId: string,
): AWS.IAM.CreateRoleRequest {
  return {
    RoleName: roleName,
    AssumeRolePolicyDocument: buildPolicyDocument(accountIds, rootOuId),
    Tags: [
      {
        Key: tagName,
        Value: tagValue,
      },
    ],
  };
}

function buildAttachPolicyRequest(roleName: string, managedPolicy: string): AWS.IAM.AttachRolePolicyRequest {
  return {
    RoleName: roleName,
    PolicyArn: `arn:aws:iam::aws:policy/${managedPolicy}`,
  };
}

function buildPolicyDocument(accountIds: string[], rootOuId: string): string {
  const policyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: accountIds.map(accountId => `arn:aws:iam::${accountId}:root`),
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'aws:PrincipalOrgID': rootOuId,
          },
        },
      },
    ],
  };
  return JSON.stringify(policyDocument, null, 2);
}
