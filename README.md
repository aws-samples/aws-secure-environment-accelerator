# PBMM Accelerator

## Installation - These instructions are intended for v1.0.5

Deploying the AWS Accelerator requires the assistance of your local AWS Account team. Attempts to deploy the Accelerator without the support of your AWS SA, TAM, Proserve, or AM will fail as new AWS accounts do not have appropriate limits established to facilitiate installation.

### Prerequisites

You need an AWS account with the AWS Landing Zone (ALZ) v2.3.1 or v2.4.0 deployed.

NOTE: If you plan to upgrade to ALZ v2.4.0, we suggest you upgrade before deploying the Accelerator.

When deploying the ALZ select:

1. Set `Lock StackSetExecution Role` to `No`
2. For production deployments, deploy to `All regions`, or `ca-central-1` for testing
3. Specify Non-Core OU Names: `Dev,Test,Prod,Central,UnClass,Sandbox` (case sensitive)

- these match the provided sample Accelerator configuration file (config.example.json)

If using an internal AWS account, to successfully install, you need to enable private marketplace before starting:

1. In the master account go here: https://aws.amazon.com/marketplace/privatemarketplace/create
2. Click Create Marketplace
3. Go to Profile sub-tab, click the `Not Live` slider to make it `Live`
4. Click the `Software requests` slider to turn `Requests off`
5. Change the name field (i.e. append `-PMP`) and change the color, so it is clear PMP is enabled for users
6. Search PrivateMarketplace for Fortinet products
7. Unselect the `Approved Products` filter and then select:
   - `Fortinet FortiGate (BYOL) Next-Generation Firewall`
8. Select "Add to Private Marketplace" in the top right
9. Wait a couple of minutes while it adds itm to your PMP - do NOT subscribe or accept the EULA
   - Repeat for `Fortinet FortiManager (BYOL) Centralized Security Management`

### Using the Installer

1. Login to the Organization **Master AWS account** where AWS Landing Zone is deployed with `AdministratorAccess`.
2. Set the region to `ca-central-1`.
3. Grant all users in the master account access to use the `AwsLandingZoneKMSKey` KMS key.
   - i.e. add a root entry - `"arn:aws:iam::123456789012:root"`, where `123456789012` is your **_master_** account id.
4. It is **_extrememly important_** that **\*\***all\*\*\* the account contact details be validated in the MASTER account before deploying any new sub-accounts. This information is copied to every new sub-account on creation. Go to `My Account` and verify/update the information lists under both the `Contact Information` section and the `Alternate Contacts` section. Please ESPECIALLY make sure the email addresses and Phone numbers are valid and regularly monitored. If we need to reach you due to suspicious account activity, billing issues, or other urgent problems with your account - this is the information that is used. It is CRITICAL it is kept accurate and up to date at all times.

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
   - Via AWS CLI:
     - `aws secretsmanager create-secret --name accelerator/github-token --secret-string <token>`

## Accelerator Configuration

1. You can use the [`config.example.json`](./config.example.json) file as base
   - Use the version from the branch you are deploying from as some parameters have changed over time
   - This configuration file can be used with minor modification to successfully deploy the standard architecture
2. At minimum, you MUST update the AWS account names and email addresses in the sample file:
   1. For existing accounts, they must match identically to the ones defined in your AWS Landing Zone;
   2. For new accounts, they must reflect the new account you want created;
   3. All new AWS accounts require a unique email address which has never before been used to create an AWS account;
   4. When updating the budget notification email addresses within the example, a single email address for all is sufficient.

### Key Things to Note:

- **For a production deployment, THIS REQUIRES EXTENSIVE PREPARATION AND PLANNING**
- **A Test environment can use the remainder of the values as-is**
- **At this time, DO NOT include any workload accounts (remove them), as it will slow down the deployment process**
- **(The ALZ AVM takes 42 minutes per sub-account. You can add additional AWS workload accounts at a later time)**

3. Create an S3 bucket in your master account with versioning enabled `your-bucket-name`
   - you must supply this bucket name in the CFN parameters _and_ in the config file
   - the bucket name _must_ be the same in both spots
4. Place your customized config file, named `config.json`, in your new bucket
5. Place the firewall configuration and license files in the folder and path defined in the config file
   - i.e. `firewall/firewall-example.txt`, `firewall/license1.lic` and `firewall/license2.lic`
   - Sample available here: `./reference-artifacts/Third-Party/firewall-example.txt`
   - If you don't have any license files, update the config file with an empty array []
6. Place any defined certificate files in the folder and path defined in the config file
   - i.e. `certs/example1-cert.key`, `certs/example1-cert.crt`
   - Sample available here: `./reference-artifacts/Certs-Sample/*`
   - Ideally you would generate real certificates using your existing certificate authority
   - Should you wish, instructions are provided to aid in generating your own self-signed certificates
   - Use the examples to demonstrate Accelerator functionality
7. Detach **_ALL_** SCP's from all OU's and accounts before proceeding
   - Installation **will fail** if this step is skipped

### Deploy the Accelerator Installer Stack

1. You can find the latest release in the repository here: https://github.com/aws-samples/aws-pbmm-accelerator/releases
2. Download the CloudFormation template `AcceleratorInstaller.template.json`
3. Use the template to deploy a new stack in your AWS account
4. Fill out the required parameters - **_LEAVE THE DEFAULTS UNLESS SPECIFIED BELOW_**
5. Specify `Stack Name` STARTING with `PBMMAccel-` (case sensitive) suggest a suffix of `deptname` or `username`
6. Change `ConfigS3Bucket` to the name of the bucket you created above `your-bucket-name`
7. Add an `Email` address to be used for notification of code releases
8. The `GithubBranch` should point to the release you selected
   - if upgrading, change it to point to the desired release
   - the latest stable branch is currently `v1.0.5-branch`, case sensitive
9. Apply a tag on the stack, Key=`Accelerator`, Value=`PBMM` (case sensitive).
10. **ENABLE STACK TERMINATION PROTECTION** under `Stack creation options`
11. The stack typically takes under 5 minutes to deploy.
12. Once deployed, you should see a CodePipeline project named `PBMMAccel-InstallerPipeline` in your account. This pipeline connects to Github, pulls the code from the prescribed branch and deploys the Accelerator state machine.
13. For new stack deployments, when the stack deployment completes, the Accelerator state machine will automatically execute (in Code Pipeline). When upgrading you must manually `Release Change` to start the pipeline.
14. Approve the `Manual Approval` step in the pipeline to start the Accelerator code deployment or upgrade.
15. Once the pipeline completes (typically under 15 minutes), the state machine, named `PBMMAccel-MainStateMachine_sm`, will start in Step Functions
16. The state machine takes several hours to execute on an initial installation. Timing for subsequent executions depends entirely on what resources are changed in the configuration file, but can take as little as 20 minutes.
17. The configuration file will be automatically moved into Code Commit (and deleted from S3). From this point forward, you must update your configuration file in CodeCommit.
18. After the perimeter account is created in AWS Organizations, but before the ALZ AVM reaches Stage 2:
    1. NOTE: If you miss the step, or fail to execute it in time, no need to be concerned, you will simply need to re-run the state machine to deploy the firwall products
    2. Login to the **perimeter** sub-account
    3. Activate the Fortinet Fortigate BYOL AMI and the Fortinet FortiManager BYOL AMI at the URL: https://aws.amazon.com/marketplace/privatemarketplace
       - Note: you should see the private marketplace, including the custom color specified in prerequisite step 4 above.
       - When complete, you should see the marketplace products as subscriptions **in the Perimeter account**:

![marketplace](img/marketplace.png)

20. Once the state machine completes successfully, confirm the status of your perimeter firewall deployment.
21. If your perimeter firewalls were not deployed on first run, you will need to rerun the state machine. This happens when:
    1. you were unable to activate the firewall AMI's before stage 2 (step 19)
    2. we were not able to fully activate your account before we were ready to deploy your firewalls
    3. In these cases, simply select the `PBMMAccel-MainStateMachine_sm` in Step Functions and select `Start Execution`
22. The Accelerator installation is complete, but several manual steps remain:
    1. recover root passwords for all sub-accounts
    2. enable MFA for **all** IAM users and **all** root users
    3. Login to the firewalls and firewall manager appliance and set default passwords
       - Update firewall configuration per your organizations security best practices
    4. In ca-central-1, Enable AWS SSO, Set the SSO directory to MAD, set the SSO email attrib to: \${dir:email}, create all default permission sets and any desired custom permission sets, map MAD groups to perm sets
    5. On a per role basis, you need to enable the CWL Account Selector in the Security and the Ops accounts

**STOP HERE, YOU ARE DONE**

## Release Process

1. Ensure `master` is in a suitable state
2. Create a version branch with [SemVer](https://semver.org/) semantics and a `branch` suffix: e.g. `v1.0.5-branch`

- **Important:** Certain git operations are ambiguous if tags and branches have the same name. Using the `branch` suffix reserves the actual version name for the tag itself.

3. Push that branch to GitHub (if created locally)
4. The release workflow will run, and create a **draft** release if successful with all commits since the last tagged release.
5. Prune the commits that have been added to the release (e.g. remove any low-information commits)
6. Publish the release - this creates the git tag in the repo and marks the release as latest.

## BELOW IS OUTDATED/INCORRECT and was only relevant for Developers working on the Accelerator

### Using the Command-Line

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

The main entry point for CDK is `accelerator/cdk/index.ts`. Is constructs the CodePipelines for the initial setup and for the account setup. The CodePipelines for initial setup and account setup are defined in

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
