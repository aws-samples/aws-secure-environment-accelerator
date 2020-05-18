# PBMM Accelerator

## Installation

### Prerequisites

You need an AWS account with Landing Zone deployed.

### Using the Installer

1. Login to the Organization **master AWS account** where AWS Landing Zone is deployed with `AdministratorAccess`.
2. Set the region to `ca-central-1`.
3. Grant all users in the master account access to use the `AwsLandingZoneKMSKey` KMS key.
   - i.e. add a root entry - `"arn:aws:iam::123456789012:root"`,

#### Create a GitHub Personal Access Token.

1. You can find the instructions on how to create a personal access token here: https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line
2. Select the scope `repo: Full control over private repositories`.
3. Store the personal access token in Secrets Manager as plain text. Name the secret `accelerator/github-token`.
    - Via AWS console
      - Store a new secret, and select `Other type of secrets`, `Plaintext`
      - Paste your secret with no formatting no leading or trailing spaces
      - Select `DefaultEncryptionKey`,
      - Set the secret name to `accelerator/github-token`
      - Select `Disable rotation`
    - Via AWS CLI: `aws secretsmanager create-secret --name accelerator/github-token --secret-string <token>`

#### Create an Accelerator Configuration File

1. You can use the [`config.example.json`](./config.example.json) file as base 
   (Use the version in branch "Desired-Config-will-require-perimeter-redeploy").
2. Make sure to update the account names and email addresses to match the ones in your account.

   ***THIS REQUIRES EXTENSIVE PREPARATION AND PLANNING. Expected file content and values will be defined in future***
   
   ***AT THIS TIME, DO NOT INCLUDE any workload accounts, as it will slow down the deployment process***
      (ALZ AVM takes 40 minutes per sub-account)

3. Store the configuration file in Secrets Manager as plain text. Name the secret `accelerator/config`.
   - Via the AWS console (pre above);
   - Via the AWS CLI `aws secretsmanager create-secret --name accelerator/config --secret-string file://<path>`

#### Deploy the Accelerator Installer Stack

1. You can find the latest release in the repository: https://github.com/aws-samples/aws-pbmm-accelerator/releases
2. Download the CloudFormation template `AcceleratorInstaller.template.json`
3. Use the template to deploy a new stack in your AWS account.
4. Fill out the required parameters.
5. Specify stack name STARTING with `PBMMAccel-` (case sensitive)
6. Apply a tag on the stack, `Accelerator=PBMM` (case sensitive).

You should now see a CodePipline project in your account that deploys the Accelerator state machine. The Accelerator
state machine should start automatically and deploy the Accelerator in your account.

After the pipline executes, the state machine will execute (Step functions).

7. After the perimeter account is created in AWS Organizations, but before the ALZ AVM finishes login to the sub-account and activate the Fortinet Fortigate BYOL AMI and the Fortinet FortiManager BYOL AMI.

### Using the Command-Line (Not required if followed above process)

Configure the AWS CLI so that CDK can deploy in the AWS account.

    export AWS_PROFILE=aws-account-profile
    export AWS_REGION=ca-central-1

If required, install the pnpm package manager.

    https://pnpm.js.org/en/installation

Install the `pnpm` dependencies.

    pnpm install

Enter the main project directory and bootstrap the CDK. You only need to execute this step once.

    cd accelerator/cdk
    pnpm run bootstrap

Next we need to enable versioning on the the S3 bucket that the CDK bootstrap command has created. You only need to
execute this step once.

Store a configuration file as a secret in secrets manager with name `accelerator/config`. You can find an example in
`config.example.json`.

Finally deploy the CDK project.

    cd accelerator/cdk
    pnpm run deploy

## Architecture

The main component of this project is a state machine that deploys CloudFormation stacks in specific accounts using CDK.
These accounts could be the master account, log archive account, security account, and so on.

The CloudFormation stacks are deployed using the CDK and are located in `initial-setup/templates` and
`account-setup/templates`. These CDK templates are deployed in the specific accounts using CodeBuild.

## Code Structure

The main entry point for CDK is `accelerator/cdk/index.ts`. Is constructs the CodePipelines for the initial setup and
for the account setup. The CodePipelines for initial setup and account setup are defined in

- `initial-setup/cdk` and
- `account-setup/cdk`.

Some actions in the state machine require Lambda functions. The code for the Lambda functions is located in
`initial-setup/lambdas/src/steps`.

## Testing

Execute the following command to execute unit tests.

    pnpm recursive test  -- --pass-with-no-tests

## Code Style

Please run `tslint` and `prettier` before committing.

    pnpm recursive run lint
    pnpx prettier --check **/*.ts

In case `prettier` finds issues, you can let `prettier` resolve the issues.

    pnpx prettier --write **/*.ts
