# ASEA to LZA Migration

## Migration Overview

In order to perform a successful migration, there are a number of tasks that customers must complete before the migration can begin. The first task is pre-migration. This step is necessary to ensure that all ASEA resources deployed are in the correct state, by updating ASEA to the latest version, and evaluating and manually remediating the resource drift of resources deployed by ASEA using the provided migration scripts. Once the resources are remediated, customers will then enable a new configuration option in the ASEA configuration that will execute the ASEA state machine to prepare the environment by only removing resources that are necessary to run ASEA state machine deployments, and other ASEA specific tasks. This last run will also effectively disable all ASEA CloudFormation custom resources from modifying any of the resources that have been deployed. After the final ASEA state machine run, the ASEA installer stack can be removed from the environment to completely disable ASEA and remove the state machine.

Once the installer stack has been removed, the customer will then run a script that will create a snapshot of every resource in every account and region that ASEA has deployed, and store that file in S3. This snapshot will be used by the LZA to identify ASEA specific resources that must be modified or referenced in later stages for dependencies. Once the mapping file is generated, the LZA configuration file generation script can also be run. This file in conjunction with the snapshot generated above, will be used to create the LZA configuration files that will be used to reference the ASEA generated resources.

After the configuration files are generated, these files will be placed in a CodeCommit repository residing in the home installation region of ASEA. Then, the LZA can be installed and reference the configuration repository created above. During the installation, the LZA will reference the newly created configuration, and the pipeline will install two additional stages. The first stage created will evaluate and created references that the LZA specific stacks can reference based off of configuration changes. This stage is executed before any core LZA stages are executed. The last stage created for migrated environments is executed after all LZA stages are executed. This stage is responsible for adding dependencies created by the LZA to ASEA stacks to ensure that all resources are handled correctly during the execution of the LZA CodePipeline.

Once the LZA is installed, customers resources will continue to exist and are still modifiable, but interaction with ASEA resources are handled specifically through the LZA configuration files. Management of LZA native environments and migration environments should see almost no difference between the configuration files in these environments.

## Pre-Requisites

- Deploy Cloud9 VPC and Setup Cloud9 Environment following instructions here:

  - https://catalog.workshops.aws/landing-zone-accelerator/en-US/workshop-advanced/lza-best-practices/create-ide-environment/setup-cloud9-environment

- Ensure you are logged into the Cloud9 terminal

- Complete the `Verify and configure software tools` section to ensure Yarn is installed

- Install `ts-node`
  ```
  yarn add ts-node
  ```
- Validate `ts-node` is installed
  ```
  yarn ts-node --version
  ```

### Clone The ASEA Repo

In order to prepare the ASEA environment for migration you will need to clone the ASEA GitHub repository:
https://github.com/aws-samples/aws-secure-environment-accelerator.git

    git clone https://github.com/aws-samples/aws-secure-environment-accelerator.git

### Deploy the migration ASEA Installer Stack

- Checkout the branch `lza-pre-migragtion` and navigate to the directory which contains the CloudFormation installer template:

  ```
  cd aws-secure-environment-accelerator
  git checkout lza-pre-migragtion
  cd reference-artifacts/Custom-Scripts/Pre-migration/cloudformation
  ```

  You will need to update the existing CloudFormation Installer stack:

- Navigate to the AWS CloudFormation console
- Select the existing installer stack then `Update Stack`
- On the `Update Stack` page, select the radio button for:
  - `Replace current template` under `Prepare Template Section`
  - Click `Next`
  - `Upload a Template File` under `Specify Template Section`
  - Select `Choose File` and navigate to the `cloudformation/AcceleratorInstaller.template.json` file.
  - Click `Next`
- On the `Specify Stack Details` in the Parameters section update only the parameter named LZAMigrationEnabled. Change the value to `true`.
  - Click `Next`
- On the `Configure Stack Options` don't make any changes.
  - Click `Next`
- On the `Review`
  - In `Capabilities` section, select the box `I acknowledge the AWS CloudFormation might create IAM resources with custom names.`
  - Click `Next`
- Wait for the stack to finish updating

### Execute the ASEA installer pipeline and state machine

- Navigate to AWS CodePipeline console
- Locate the ASEA-InstallerPipeline under the Pipeline/Pipelines section
- Select the pipeline and then click on `Release change`
- Wait for the pipeline execution to complete
- The last step of the pipeline will start the ASEA main state machine
- Monitor the progress of the main state machine
- Navigate to the AWS Step Function console
- The `ASEA-MainStateMachine_sm` should be running
- Wait until the `ASEA-MainStateMachine_sm` is finished before moving to the next section

### Disable ASEA State Machine

TBD

### Install the project dependencies and build the project

- Ensure you are still on the `lza-pre-migragtion` branch and navigate to the directory which contains the migration scripts:
  ```
  cd aws-secure-environment-accelerator
  git checkout lza-pre-migragtion
  cd reference-artifacts/Custom-Scripts/Pre-migration/src
  ```
- Install dependencies and build the project:
  ```
  yarn install
  yarn build
  ```

### Deploy CloudFormation Template

Prior to running the mapping script, a CloudFormation script will need to be deployed. This will deploy an S3 bucket that has:

- Object versioning enabled
- AWS S3 SSE (server side encryption) enabled
- Public access blocked
- Bucket policy to scope down access to specific users
- Bucket policy to require encrpytion while writing objects

The script exists under:
`<rootDir>/src/cloudformation/mapping-output-bucket.yml`

In order to deploy the script, you will need to:

- Navigate to the AWS CloudFormation console
- Select `Create Stack`
- On the `Create Stack` page, select the radio buttons for:
  - `Template is Ready` under `Prepare Template Section`
  - `Upload a Template File` under `Specify Template Section`
  - Select `Choose File` and navigate to the `src/cloudformation/mapping-output-bucket.yml` file.
  - Click `Next`.
- On the `Specify Stack Details` page fill out the fields for:
  - `StackName`
  - `S3BucketName` - This needs to be a unique bucket name in order to be created and will store the mapping output files.
- Make sure to copy the `S3BucketName` field, as it will be used to update the `mappingBucketName` field in the next section.

### CloudFormation Deployment Validation

After deploying the `mapping-output-bucket.yml` template the S3 Bucket Resource created will need to be validated. In order to validate this:

- Navigate to S3 in the AWS Console
- Select the bucket that you created in the previous step
- Click on `Properties`
- Ensure that `Bucket Versioning` is enabled
- Ensure that `Default Encryption` is set to `Amazon S3 managed keys (SSE-S3)`
- Ensure that Block Public Access is enabled
- Ensure that an S3 Bucket Policy is created and validate the bucket policy

## Pre-Migration Scripts

### Retrieve Temporary IAM Credentials via AWS Identity Center

Prior to running the pre-migration scripts, you will need temporary IAM credentials in order to run the script. In order to retrieve these, follow the instructions here and set the temporary credentials in your environment:
https://aws.amazon.com/blogs/security/aws-single-sign-on-now-enables-command-line-interface-access-for-aws-accounts-using-corporate-credentials/

### Update Configuration File

- Navigate to:
  `<rootDir>/src/input-config/input-config.example.json`

- Modify the values below:
  - _`aseaPrefix`_ - The ASEA prefix used for ASEA deployed resources. This can be found in the initial ASEA Installer CloudFormation template `Parameters` under `AcceleratorPrefix`. Ex: `ASEA`
    - Note: This value should not include the trailing `'-'` character
  - _`repositoryName`_ - The ASEA Repository name used to store ASEA Configuration files. This can be found either in the initial ASEA Installer CloudFormation template `Parameters` under `ConfigRepositoryName` or in the CodeCommit Service.
  - - `assumeRoleName`\* - The name of the role which will be assumed during the migration process.
  - _`parametersTableName`_ - The name of the DynamoDB Table where ASEA account metadata is stored. This can be found by:
    - Navigating to the DynamoDB service home page
    - Selecting `Tables` from the drop down on the left side of the console.
    - Finding the table name similar to `<prefix-name>-Parameters`.
  - _`homeRegion`_ - Home Region for ASEA. This field can be retrieved from the ASEA Configuration file.
  - _`mappingFileName`_ - Name of the S3 key to write the mapping output to. Ex: `aseaMapping.json`
  - _`mappingBucketName`_ - Name of the S3 bucket to write the mapping output to. Ex: `asea-mapping-outputs`
  - _`centralBucket`_ - Name of ASEA created phase-0 central bucket, will be used to copy and convert assets for LZA.
  - _`configOutputFolder`_ - Output location to save converted configuration.

Example `input-config.example.json` file:

```
{
  "aseaPrefix": "<ASEA-Prefix>",
  "repositoryName": "<ASEA-Config-Repository-Name>",
  "assumeRoleName": "<ASEA-Role>",
  "parametersTableName": "<ASEA-Parameters-DDB-Table-Name>",
  "homeRegion": "<ASEA-Home-Region>",
  "mappingFileName": "<Output-Mapping-File-Name>",
  "mappingBucketName": "<Output-Mapping-Bucket-Name>",
  "centralBucket": "<ASEA-Phase0-Central-Bucket>",
  "configOutputFolder": "<Output-Location-For-Converted-Config>"
}
```

- Rename the `input-config.example.json` file to `input-config.json`

## Resource Mapping and Drift Detection Scripts

### Overview

The Resource Mapping script will generate the ASEA mapping file which will be used throughout the ASEA to LZA Migration process. In order to accomplish this task, the script needs to do the following:

- Ensure that the S3 Bucket exists and has proper object versioning enabled
- Retrieve all ASEA Enabled Regions from the ASEA Configuration File.
- Retrieve all ASEA Enabled Accounts from the ASEA Parameters Table.
- Assume a role into each account and create a unique AWS CloudFormation client for each environment (region/account combination). For each unique environment:
  - List every CloudFormation Template associated with ASEA (This is a filtered down list operation)
  - List every Resource that is associated with the CloudFormation Template.
  - Detect Drift on each individual resource
- The outputs of these will be saved in the S3 Bucket.

### Commands

```
cd <root-dir>
yarn run resource-mapping
```

### Outputs

After running the `resource-mapping` script, the following artifacts should be generated inside the S3 bucket which has been deployed via CloudFormation and passed in the config file as `mappingBucketName`:

- Resource Mapping File
- Drift Detection File (per account/per region/per stack)
- Stack Resource File (per account/per region/per stack)
- Aggregate Drift Detection File (All drifted resources)

In order to validate the output artifacts, the following items will need to be verified inside the S3 Bucket (_Output-Mapping-Bucket_):

- Resource Mapping File
  - Look for file which matches _Output-Mapping-File-Name_ from configuration file.
  - Spot Check that file has correct accounts, regions, and stacks
- Aggregated Drift Detection File

  - Look for a file named `AllDriftDetectedResources.csv`
  - Ensure that the resources listed in the CSV file match up with the specific CloudFormation drift-detection status of the CloudFormation resources in each individual stack. The possible values for the resources are:
    - IN_SYNC - there is no drift detected in the CloudFormation Resource
    - MODIFIED - drift has been detected in the CloudFormation Resource. The metadata in the `PropertyDifferences` column describes the drift that needs to be fixed.
    - NOT_SUPPORTED means that CloudFormation does not support drift-detection on that specific resource.
  - If there is drift detected, this drift needs to be manually fixed. The specific resource and configurations which need to be addressed will be available in the drift-detection.csv file under `PropertyDifferences` or by Detecting Drift manually in the CloudFormation console (https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/detect-drift-stack.html)

- Drift Detection Files
  For a more granular look at Drift Detection, this is available on an account/region/stack basis as well: - Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-drift-detection.csv` - Ensure that the resources listed in the CSV file match up with the CloudFormation drift-detection status of the CloudFormation resources in the stack. The possible values for the resources are: - IN_SYNC - there is no drift detected in the CloudFormation Resource - MODIFIED - drift has been detected in the CloudFormation Resource. The metadata in the `PropertyDifferences` column describes the drift that needs to be fixed. - NOT_SUPPORTED means that CloudFormation does not support drift-detection on that specific resource. - If there is drift detected, this drift needs to be manually fixed. The specific resource and configurations which need to be addressed will be available in the drift-detection.csv file under `PropertyDifferences` or by Detecting Drift manually in the CloudFormation console (https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/detect-drift-stack.html)
  Stack Resource List Output
  For each Account, Region, and Stack: - Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-resources.csv` - Ensure that the resources listed in the CSV file match up with the deployed CloudFormation resources in the stack.

## Custom Resource Drift Detection

### Overview

The above section covers Drift Detection on CloudFormation native resources. However, ASEA and LZA both utilize many Lambda-backed custom-resources as well. To successfully detect drift during the migration process, there is a snapshot tool that records the state of custom resources.

The snapshot tool supports the following commands:

    - yarn run snapshot pre
    - yarn run snapshot post
    - yarn run snapshot report
    - yarn run snapshot reset

Each subcommand of the snapshot tool and its associated actions can be found below:

- `yarn run snapshot pre` - This command should be run _`before`_ the migration process. Describes all custom resource states before the migration and saves the results in `${aseaPrefix}-config-snapshot`
- `yarn run snapshot post` - This command should be run _`after`_ the migration process. Describes all custom resource states after the migration and saves the results in `${aseaPrefix}-config-snapshot`
- `yarn run snapshot report` - This command should be run _`after`_ the pre and post snapshot commands have been run. Runs a diff on the Pre and Post snapshot resources and outputs a list of the diffs.
- `yarn run snapshot reset` - Deletes the DynamoDB table `${aseaPrefix}-config-snapshot`

In order to do this, the tool does the following:

- Creates DynamoDB table in the `${homeRegion}` to store snapshot data. The table is named `${aseaPrefix}-config-snapshot`:
- Assume a role into each account and makes AWS api calls to describe the state of each service managed by a custom resources. In each account/region:
  - For each custom resource type, retrieve associated AWS resource, attributes, and state
- The data will then be stored in the DynamoDB table with the following fields:
  - `AccountRegion` - `${AccountKey}:${Region}` key to identify what account and region the resource lives in
  - `ResourceName` - Custom Resource Id
  - `PreMigrationJson` (Created after snapshot pre) - This field contains the metadata and state of the resource(s) associated with the Custom Resource prior to the migration.
  - `PreMigrationHash` (Created after snapshot pre) - This field contains a hashed value of the premigration json.
  - `PostMigrationJson` (Created after snapshot post) - This field contains the metadata and state of the resource(s) associated with the Custom Resource after the migration is complete.
  - `PostMigrationHash` (Created after snapshot post) - This field contains a hashed value of the postmigration json.

### Commands

```
cd <root-dir>
yarn run snapshot pre|post|report|reset
```

### Outputs

In order to validate the snapshot behaviors, you will need to do the following:

- Navigate to `DynamoDB` in the AWS console.
- Click on `Tables` on the left side of the page.
- On the `Tables` page, select the radio-button next to the table `${aseaPrefix}-config-snapshot`
- Once you have selected the radio-button, click on the `Explore Table Items` button in the top right.

#### Snapshot-Pre

After running the snapshot pre command, ensure that the DynamoDB table `${aseaPrefix}-config-snapshot` has been created. This table should be populated with the following fields:

    -   AccountRegion
    -   ResourceName
    -   PreMigrationJson
    -   PreMigrationHash

#### Snapshot-Post

After running the snapshot post command, ensure that the DynamoDB table `${aseaPrefix}-config-snapshot` has been updated. This table should be populated with the following fields:

    -   AccountRegion
    -   ResourceName
    -   PreMigrationJson
    -   PreMigrationHash
    -   PostMigrationJson
    -   PostMigrationHash

#### Snapshot-Report

After running the snapshot pre and post commands, you can run the `yarn run snapshot report` command. This command will compare the `PreMigrationJson` and `PostMigrationJson` fields in DynamoDB and output the difference to the console.

#### Snapshot-Reset

After running the command `yarn run snapshot reset` - Validate that the `${aseaPrefix}-config-snapshot` has been deleted.

## Convert Configuration

### Overview

In order to accomplish the migration, the existing ASEA configuration file needs to be converted into LZA configuration files (https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/using-configuration-files.html). The `convert-config` script parses through the ASEA configuration file and for each resource block does the following:

- Reads in the ASEA configuration object
- Decides the ASEA Object Type
- Maps object and resource metadata file to LZA Object
- Creates proper Deployment Targets for the LZA Object (This defines which accounts the resource will be deployed to)

Once the entire ASEA configuration file has been converted, the output LZA configuration files will be stored locally in the current directory in a new sub-directory with the name of the `configOutputFolder` field in the configuration file.

These artifacts and configuration files will be utilized later in the process as the input artifacts for the Landing Zone Accelerator Deployment.

### Commands

```
cd <root-dir>
yarn run convert-config
```

### Outputs

After running the `convert-config` script, the following artifacts should be generated in the current directory in a subdirectory with the name of the value passed to `configOutputFolder`:

- Configuration Files
  - `accounts-config.yaml`
  - `global-config.yaml`
  - `iam-config.yaml`
  - `network-config.yaml`
  - `organization-config.yaml`
  - `security-config.yaml`
- Dynamic Partitioning preferences
  - `dynamic-partitioning/log-filters.json`
- IAM Policies
  - `iam-policy/*`
- Service Control Policies (SCPs)
  - `service-control-policies/*`
- SSM Documents
  - `ssm-documents/*`

## Installing the Landing Zone Accelerator

### Prerequisites

### Create Code Commit Repository

- Create a Code Commit Repository in your `${homeRegion}`
  - https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-create-repository.html
- Upload generated LZA Configs and artifacts
  - These are the configs and artifacts output by the `convert-config` script.

### Delete ASEA CDK-Toolkit

- Delete the ${Prefix}-CDK-Toolkit in both the $HOME_REGION and $GLOBAL_REGION
- For $HOME_REGION
  - Navigate to the CloudFormation homepage
  - In the top right corner, select your $HOME_REGION from the region selector drop down.
  - In the CloudFormation dashboard, locate and select the ${Prefix}-CDK-Toolkit stack
  - Click on the Delete button.
- For $GLOBAL_REGION:
  - Navigate to the CloudFormation service homepage
  - In the top right corner, select your $GLOBAL_REGION from the region selector drop down.
  - In the CloudFormation dashboard, locate and select the ${Prefix}-CDK-Toolkit stack.
  - Click on the Delete button.

### Clone the LZA Repository

- Clone the LZA Repository from: https://github.com/awslabs/landing-zone-accelerator-on-aws
  From your home directory (ensure this is not inside the ASEA repository)

```
git clone https://github.com/awslabs/landing-zone-accelerator-on-aws.git
```

- Checkout the `` branch

### Synthesizing the LZA Installer Stack

The Installer Stack, a CDK Application, can be deployed through a CloudFormation template produced by your CLI by navigating to the directory for the installer and running a CDK synthesis. The template can either be deployed directly via the AWS CLI or console. Below are the commands for completing the deployment of the Installer stack.

- Install project dependencies

```
cd <rootDir>/source
yarn install && yarn lerna link
```

- To run the CDK synthesis

```
cd <rootDir>/source/packages/@aws-accelerator/installer
yarn build && yarn cdk synth --context enable-asea-migration-true
```

This above command will build and synthesize the LZA installer stack, in addition, the `--context enable-asea-migration-true` will add ASEA migration specific stages to the LZA pipeline.

After running these commands, the Installer stack template will be saved to <rootDir>/source/packages/@aws-accelerator/installer/cdk.out/AWSAccelerator-InstallerStack.template.json

- https://github.com/awslabs/landing-zone-accelerator-on-aws#1-build-the-installer-stack-for-deployment

### Installing the LZA Pipeline

Once you have completed the prerequisites and synthesized the LZA Installer stack, you are ready to deploy the solution. The AWS CloudFormation template deploys two AWS CodePipeline pipelines, an installer and the core deployment pipeline, along with associated dependencies. This solution uses AWS CodeBuild to build and deploy a series of CDK-based CloudFormation stacks that are responsible for deploying supported resources in the multi-account, multi-Region environment. The CloudFormation template will first create the `${LZAprefix}-Installer`, which in turn will create the accelerator pipeline, `${LZAprefix}-Pipeline`

- For more details on the deployment pipelines, take a look here:
  https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deployment-pipelines.html

- In order to deploy the CloudFormation stack, you will need to do the following:

- Navigate to the CloudFormation service in the `${homeRegion}`.
- Click `Create Stack` in the top right corner. Select `With new resources(standard)`
  - Select the radio button for `Template is Ready`
  - Choose `Upload a template file`
  - Select the template which was synthesized in the previous step. This template should reside here:
    `<rootDir>/source/packages/@aws-accelerator/installer/cdk.out/AWSAccelerator-InstallerStack.template.json`
  - Once you have selected the template file, you will need to enter the stack parameters, use the default values except for the following:
    - _`Branch Name`_ - This needs to point to the ASEA Migration branch which is -insert-branch-name-here-
    - _`Accelerator Resource name prefix`_ - This needs to match the prefix used for the ASEA deployment. Do NOT include the additional `'-'`.
    - _`Existing Config Repository Name`_ - This will be the name of the CodeCommit repository you created in the `Create Code Commit Repository` section above.

### Run the LZA Pipeline

- For general LZA Pipeline deployment details, refer to the LZA Implementation Guide here: https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html
- During the Landing Zone Accelerator pipeline deployment, there are two ASEA migration specific stages -- `ImportAseaResources` and `PostImportAseaResources`. These two stages allow the LZA to manage and interact with resources that were originally managed in the scope of ASEA.
- _`ImportAseaResources`_ - This stage uses the `CFNInclude` module to include the original ASEA Managed CloudFormation resources. This allows the resources to be managed in the context of the LZA CDK Application. SSM Parameters are created for these resources so that they can be interacted with during the LZA Pipeline run.
- _`PostImportAseaResources`_ - This stage runs at the end of the LZA Pipeline, it allows the LZA pipeline to modify original ASEA Managed Cloudformation resources. This requires a seperate stage because it allows the prior LZA stages to interact with ASEA resources and then modifies all ASEA resources (as opposed to CFN Including the ASEA resources in every stage).

## Disabling the ASEA State Machine

WIP

## ASEA to LZA Migration Rollback Strategy

### Overview

The existing ASEA to LZA upgrade process relies on a combination of automated and manual mechanisms to accomplish the upgrade. This is due to AWS service limits as well as resource collisions of resources which exist in both the ASEA and LZA solutions.

### Problem

If an issue occurs during the upgrade process, there needs to be a rollback plan in place. Since the migration process utilizes both automated and manual steps, we will roll back in an automated fashion where possible and require manual steps for others. The high-level rollback steps are below.

### Rollback Steps

- Delete the ${Prefix}-CDK-Toolkit in both the $HOME_REGION and $GLOBAL_REGION
- For $HOME_REGION
  - Navigate to the CloudFormation homepage
  - In the top right corner, select your $HOME_REGION from the region selector drop down.
  - In the CloudFormation dashboard, locate and select the ${Prefix}-CDK-Toolkit stack
  - Click on the Delete button.
- For $GLOBAL_REGION:
  - Navigate to the CloudFormation service homepage
  - In the top right corner, select your $GLOBAL_REGION from the region selector drop down.
  - In the CloudFormation dashboard, locate and select the ${Prefix}-CDK-Toolkit stack.
  - Click on the Delete button.
- Run ASEA Installer Stack
  - Download the Installer Stack from: https://github.com/aws-samples/aws-secure-environment-accelerator/releases
  - Navigate to the CloudFormation homepage
  - Click on the “Create Stack” button
  - Choose the option “Upload a template file” and click on the “Choose file” button.
  - Navigate to the Installer Stack template on your local machine, select the file, and click “Next”
  - On the “Specify Stack details” page, provide a stack name for your deployment.
  - Fill in the CloudFormation Parameters.
  - Complete CloudFormation deployment.
- Run the ASEA-InstallerPipeline
  - After deploying the CloudFormation template, a new CodePipeline pipeline will be created. This Pipeline will be called {$Prefix}-InstallerPipeline. - The Code Pipeline will automatically trigger an execution and begin running when created
  - This pipeline runs a CodeBuild job which does a number of things – most importantly, create the ASEA State Machine.
  - Run the ASEA State Machine
  - After the InstallerPipeline has successfully run, the ASEA State Machine will be kicked off which will ensure that ASEA features are rolled back to match the ASEA configuration.
- Cleanup LZA and associated resources https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/uninstall-the-solution.html
