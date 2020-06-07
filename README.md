# PBMM Accelerator

## Installation

### Prerequisites

You need an AWS account with the AWS Landing Zone (ALZ) v2.3.1 or v2.4.0 deployed.  

NOTE: If you plan to upgrade to ALZ v2.4.0, we suggest you upgrade before deploying the Accelerator.

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
   - i.e. add a root entry - `"arn:aws:iam::123456789012:root"`, where `123456789012` is your ***master*** account id.

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

  * **For a production deployment, THIS REQUIRES EXTENSIVE PREPARATION AND PLANNING **
  * **A Test environment can use the remainder of the values as-is**
  * **AT THIS TIME, DO NOT include any workload accounts (remove them), as it will slow down the deployment process**
  * **(The ALZ AVM takes 42 minutes per sub-account.  You can add additional AWS workload accounts at a later time)**

3. Create an S3 bucket in your master account with versioning enabled `your-bucket-name`
   - supply this bucket name in the CFN parameters and in the config file (must be the same bucket in both spots)
4. Place your config file, named `config.json`, in your new bucket
5. Place the firewwall configuration and license files in the folder and path defined in the config file
   - i.e. `firewall/firewall-example.txt`, `firewall/license1.lic` and `firewall/license2.lic`
   - Sample available here: `./reference-artifacts/Third-Party/firewall-example.txt`
   - If you don't have a license file, update the config file with an empty array []
   - v1.0.4 is a string/single mandatory config file, later versions require an array
6. Place any defined certificate files in the folder and path defined in the config file
   - i.e. `certs/domain1.key`, `certs/domain1.crt`
   - Sample available here: `./reference-artifacts/Certs-Sample/*`
   - Not used in v1.0.4
7. (v1.0.4 only) Add a bucket policy, replacing `your-bucket-name` and `123456789012` with the perimeter account id:
   (You can only do this after perimeter account is created, but must be done before Phase 2, so prepare it now)

```json
{
    "Version": "2012-10-17",
    "Id": "Policy1590356756537",
    "Statement": [
        {
            "Sid": "Stmt1590356754293",
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::123456789012:root"
            },
            "Action": "s3:*",
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        }
    ]
}
```



### Deploy the Accelerator Installer Stack

1. You can find the latest release in the repository here: https://github.com/aws-samples/aws-pbmm-accelerator/releases
2. Download the CloudFormation template `AcceleratorInstaller.template.json`
3. Use the template to deploy a new stack in your AWS account
4. Fill out the required parameters - ***LEAVE THE DEFAULTS UNLESS SPECIFIED BELOW***
5. Specify `Stack Name` STARTING with `PBMMAccel-` (case sensitive) suggest a suffix of `deptname` or `username`
6. Change `ConfigS3Bucket` to the name of the bucket you created above `your-bucket-name`
7. Add an `Email` address to be used for notification of code releases
8. The `GithubBranch` should point to the release you selected
   - if upgrading, change it to point to the desired release
   - the latest stable branch is currently v1.0.4, case sensitive
9. Apply a tag on the stack, Key=`Accelerator`, Value=`PBMM` (case sensitive).
10. **ENABLE STACK TERMINATION PROTECTION**
11. Once the stack deploys, you should see a CodePipline project in your account that deploys the Accelerator state machine. You will need to approve the pipeline to start the Accelerator code deployment or upgrade.  Once complete, the Accelerator state machine should start automatically and deploy the Accelerator in your account.
12. After the pipeline executes, the state machine will execute (Step functions).  The configuration file should be automatically moved into Code Commit (and deleted from S3).  From this point forward, you must update your configuration file in CodeCommit.
13. After the perimeter account is created in AWS Organizations, but before the ALZ AVM finishes:
   1. (v1.0.4 only) Apply the bucket policy to `your-bucket-name` in the master account, as defined in step 7 (above), making sure you update ir with the peirmeter `account id`
   2. login to the **perimeter** sub-account 
   3. create a small /24 VPC, create a small /24 subnet, start a AL2 t2.micro instance
   4. activate the Fortinet Fortigate BYOL AMI and the Fortinet FortiManager BYOL AMI at the URL: https://aws.amazon.com/marketplace/privatemarketplace
      - Note: you should see the private marketplace, including the custom color specified in prerequisite step 4 above.
      - When complete, you should see the marketplace products as subscriptions **in the Perimeter account**:
   5. After 15 minutes, delete the t2.micro instance, delete the vpc and subnet

![marketplace](img/marketplace.png)

**Note:** In v1.0.4, Phase 2 is ***likely to fail*** in the `perimeter` account for one of several reasons:
  - You were unable to set the bucket policy with the perimeter account id before phase 2  
  - You were unable to activate the marketplace AMI's in the perimeter account before phase 2
  - You failed to put a non-empty license file (does not need to be valid) and a valid firewall config file in your bucket
  - You did not start the t2.micro instance early enough.  New AWS accounts are uninitialized and do not have any limits established which can result in the following CloudFormation error in Phase 2 when attempting to deploy the firewall instances:

```
Your request for accessing resources in this region is being validated, and you will not be able to launch additional resources in this region until the validation is complete. We will notify you by email once your request has been validated. While normally resolved within minutes, please allow up to 4 hours for this process to complete. If the issue still persists, please let us know by writing to aws-verification@amazon.com for further assistance.
```

***To proceed, please complete the first 3 tasks and then to resolve item 4, please launch and run a t2.micro instance in the perimeter account for 15 minutes, at which time it can be terminated, and then re-run the state machine.***


**STOP HERE, YOU ARE DONE**



## BELOW IS OUTDATED/INCORRECT

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
