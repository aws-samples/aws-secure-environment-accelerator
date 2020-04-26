# PBMM Accelerator

## Requirements

- NodeJS 12.x
- pnpm version 4.x https://github.com/pnpm/pnpm

## Installation

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
