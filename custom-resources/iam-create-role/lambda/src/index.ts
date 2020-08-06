import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';

const iam = new AWS.IAM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create IAM Role...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
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
  try {
    await iam
      .getRole({
        RoleName: event.ResourceProperties.roleName,
      })
      .promise();
  } catch (error) {
    if (error.code === 'NoSuchEntity') {
      console.log(error.message);
      const crossRole = await iam
        .createRole(
          buildCreateRoleRequest(
            event.ResourceProperties.roleName,
            event.ResourceProperties.accountIds,
            event.ResourceProperties.tagName,
            event.ResourceProperties.tagValue,
          ),
        )
        .promise();
      for (const managedPolicy of event.ResourceProperties.managedPolicies) {
        await iam.attachRolePolicy(buildAttachPolicyRequest(crossRole.Role.RoleName, managedPolicy)).promise();
      }
    }
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

function buildCreateRoleRequest(
  roleName: string,
  accountIds: string[],
  tagName: string,
  tagValue: string,
): AWS.IAM.CreateRoleRequest {
  return {
    RoleName: roleName,
    AssumeRolePolicyDocument: buildPolicyDocument(accountIds),
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

function buildPolicyDocument(accountIds: string[]): string {
  const policyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: accountIds.map(accountId => `arn:aws:iam::${accountId}:root`),
        },
        Action: 'sts:AssumeRole',
      },
    ],
  };
  return JSON.stringify(policyDocument, null, 2);
}
