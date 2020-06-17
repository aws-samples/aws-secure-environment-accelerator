import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

const iam = new AWS.IAM();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Set/Update IAM password policy...`);
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
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  try {
    // Set/Update IAM account password policy
    await iam
      .updateAccountPasswordPolicy({
        AllowUsersToChangePassword: toBoolean(event.ResourceProperties.allowUsersToChangePassword),
        HardExpiry: toBoolean(event.ResourceProperties.hardExpiry),
        RequireUppercaseCharacters: toBoolean(event.ResourceProperties.requireUppercaseCharacters),
        RequireLowercaseCharacters: toBoolean(event.ResourceProperties.requireLowercaseCharacters),
        RequireSymbols: toBoolean(event.ResourceProperties.requireSymbols),
        RequireNumbers: toBoolean(event.ResourceProperties.requireNumbers),
        MinimumPasswordLength: event.ResourceProperties.minimumPasswordLength,
        PasswordReusePrevention: event.ResourceProperties.passwordReusePrevention,
        MaxPasswordAge: event.ResourceProperties.maxPasswordAge,
      })
      .promise();
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
