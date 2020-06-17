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
        AllowUsersToChangePassword: Boolean(event.ResourceProperties.allowUsersToChangePassword),
        HardExpiry: Boolean(event.ResourceProperties.hardExpiry),
        RequireUppercaseCharacters: Boolean(event.ResourceProperties.requireUppercaseCharacters),
        RequireLowercaseCharacters: Boolean(event.ResourceProperties.requireLowercaseCharacters),
        RequireSymbols: Boolean(event.ResourceProperties.requireSymbols),
        RequireNumbers: Boolean(event.ResourceProperties.requireNumbers),
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
