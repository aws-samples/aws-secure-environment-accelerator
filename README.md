# PBMM Accelerator

## Installation

### Prerequisites

You need an AWS account with Landing Zone v2.3.1 deployed (v2.4.0 not yet tested).

When deploying ALZ select: 
1. Set `Lock StackSetExecution Role` to `No`
2. For production deployments, deploy to `All regions`, or `ca-central-1` for testing
3. Specify Non-Core OU Names: `Dev,Test,Prod,Central,Unclass,Sandbox` (case sensitive)
  - these match the provided sample Accelerator configuration file (config.example.json)

If using an internal AWS account, to successfully install, you need to enable private marketplace before starting:
1. In the master account go here: https://aws.amazon.com/marketplace/privatemarketplace/create
2. Click Create Marketplace
3. Go to Profile sub-tab, click the 'Not Live' slider to make it 'Live'
4. Change the name field (i.e. append -PMP) and change the color, so it is clear PMP is enabled for users
5. Search PrivateMarketplace for Fortinet products
6. Unselect the `Approved Products` filter and then select:
   - `Fortinet FortiGate (BYOL) Next-Generation Firewall` 
6. Select "Add to Private Marketplace" in the top right
7. Wait a couple of minutes while it adds itm to your PMP - do NOT subscribe or accept the EULA
   - Repeat for `Fortinet FortiManager (BYOL) Centralized Security Management`
   
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

1. You can use the [`config.example.json`](./config.example.json) file as base (from the master branch)
2. Make sure to update the account names and email addresses to match the ones in your account, or that you want to create

   ***THIS REQUIRES EXTENSIVE PREPARATION AND PLANNING. Expected file content and values will be defined in future***
   
   ***AT THIS TIME, DO NOT INCLUDE any workload accounts, as it will slow down the deployment process***
   ***The ALZ AVM takes 42 minutes per sub-account, you can add additional AWS workload accounts at a later time***

3. Create an S3 bucket in your master account, preferably encrypted with the `AwsLandingZoneKMSKey` KMS key, and versioning enabled
4. Place your config file, named `config.json`, in your new bucket
   
#### Deploy the Accelerator Installer Stack

1. You can find the latest release in the repository: https://github.com/aws-samples/aws-pbmm-accelerator/tree/master/reference-artifacts/deployment (master branch)
2. Download the CloudFormation template `AcceleratorInstaller.template.json`
3. Use the template to deploy a new stack in your AWS account
4. Fill out the required parameters - ***LEAVE THE DEFAULTS UNLESS SPECIFIED BELOW***
5. Specify stack name STARTING with `PBMMAccel-` (case sensitive)
6. Change `ConfigS3Bucket` to the name of the bucket holding your configuaration file
7. Add an `Email` address to be used for notification of code releases
8. Change `GithubBranch` to the latest stable branch (currently master, case sensitive)
9. Apply a tag on the stack, Key=`Accelerator`, Value=`PBMM` (case sensitive).

You should now see a CodePipline project in your account that deploys the Accelerator state machine. The Accelerator
state machine should start automatically and deploy the Accelerator in your account.  The configuration file should be moved into Code Commit.  From this point forward, you must update your configuration file in CodeCommit.

After the pipline executes, the state machine will execute (Step functions).

10. After the perimeter account is created in AWS Organizations, but before the ALZ AVM finishes login to the sub-account and activate the Fortinet Fortigate BYOL AMI and the Fortinet FortiManager BYOL AMI.

***STOP HERE, YOU ARE DONE***

***BELOW IS OUTDATED/INCORRECT***

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
