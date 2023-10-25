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

import { IAMClient, UpdateAccountPasswordPolicyCommand } from '@aws-sdk/client-iam';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
const iam = new IAMClient();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Set/Update IAM password policy...`);
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
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  try {
    // Set/Update IAM account password policy
    await throttlingBackOff(() =>
      iam.send(
        new UpdateAccountPasswordPolicyCommand({
          AllowUsersToChangePassword: toBoolean(event.ResourceProperties.allowUsersToChangePassword),
          HardExpiry: toBoolean(event.ResourceProperties.hardExpiry),
          RequireUppercaseCharacters: toBoolean(event.ResourceProperties.requireUppercaseCharacters),
          RequireLowercaseCharacters: toBoolean(event.ResourceProperties.requireLowercaseCharacters),
          RequireSymbols: toBoolean(event.ResourceProperties.requireSymbols),
          RequireNumbers: toBoolean(event.ResourceProperties.requireNumbers),
          MinimumPasswordLength: event.ResourceProperties.minimumPasswordLength,
          PasswordReusePrevention: event.ResourceProperties.passwordReusePrevention,
          MaxPasswordAge: event.ResourceProperties.maxPasswordAge,
        }),
      ),
    );
  } catch (e) {
    console.warn(`Ignore Set/Update IAM account password policy failure`);
    console.warn(e);
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

function toBoolean(value: string | boolean): boolean {
  if (typeof value === 'string') {
    return value === 'true';
  }
  return value;
}
