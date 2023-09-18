# ASEA to LZA Migration (Alpha)

## Migration Overview

In order to perform a successful migration, there are a number of tasks that customers must complete before the migration can begin. The first task is generating the configuration file for the migration tool. Followed by steps that are necessary to ensure that all ASEA resources deployed are in the correct state, by updating ASEA to the latest version, and evaluating and manually remediating the resource drift of resources deployed by ASEA using the provided migration scripts. Once the resources are remediated, customers will then enable a new configuration option in the ASEA configuration that will execute the ASEA state machine to prepare the environment by only removing resources that are necessary to run ASEA state machine deployments, and other ASEA specific tasks. This last run will also effectively disable all ASEA CloudFormation custom resources from modifying any of the resources that have been deployed. After the final ASEA state machine run, the ASEA installer stack can be removed from the environment to completely disable ASEA and remove the state machine.

Once the installer stack has been removed, the customer will then run a script that will create a snapshot of every resource in every account and region that ASEA has deployed, and store that file in S3 and CodeCommit. This snapshot will be used by the LZA to identify ASEA specific resources that must be modified or referenced in later stages for dependencies. Once the mapping file is generated, the LZA configuration file generation script can also be run. This file in conjunction with the snapshot generated above, will be used to create the LZA configuration files that will be used to reference the ASEA generated resources.

After the configuration files are generated, these files will be placed in a CodeCommit repository residing in the home installation region of ASEA. Then, the LZA can be installed and reference the configuration repository created above. During the installation, the LZA will reference the newly created configuration, and the pipeline will install two additional stages. The first stage created will evaluate and created references that the LZA specific stacks can reference based off of configuration changes. This stage is executed before any core LZA stages are executed. The last stage created for migrated environments is executed after all LZA stages are executed. This stage is responsible for adding dependencies created by the LZA to ASEA stacks to ensure that all resources are handled correctly during the execution of the LZA CodePipeline.

Once the LZA is installed, customers resources will continue to exist and are still modifiable, but interaction with ASEA resources are handled specifically through the LZA configuration files. Management of LZA native environments and migration environments should see almost no difference between the configuration files in these environments.

### Pre-Requisites

- You are running the latest version of ASEA. If you are not running version 1.5xx then upgrade before starting the migration process
- Deploy Cloud9 VPC and Setup Cloud9 Environment following instructions here:
  - https://catalog.workshops.aws/landing-zone-accelerator/en-US/workshop-advanced/lza-best-practices/create-ide-environment/setup-cloud9-environment
- Ensure you are logged into the Cloud9 terminal
- Complete the `Verify and configure software tools` section to ensure Yarn is installed

### Clone The ASEA Repo

In order to prepare the ASEA environment for migration you will need to clone the ASEA GitHub repository:
https://github.com/aws-samples/aws-secure-environment-accelerator.git
git clone https://github.com/aws-samples/aws-secure-environment-accelerator.git

### Install the migration scripts project dependencies and build the project

- Ensure you are still on the `asea-lza-migration` branch and navigate to the directory which contains the migration scripts:
  ```
  cd aws-secure-environment-accelerator
  git checkout lza-migration
  cd reference-artifacts/Custom-Scripts/Pre-migration/src
  ```
- Install dependencies and build the project:
  ```
  yarn install
  yarn build
  ```

## Pre-Migration Scripts

### Retrieve Temporary IAM Credentials via AWS Identity Center

Prior to running the pre-migration scripts, you will need temporary IAM credentials in order to run the script. In order to retrieve these, follow the instructions here and set the temporary credentials in your environment:
https://aws.amazon.com/blogs/security/aws-single-sign-on-now-enables-command-line-interface-access-for-aws-accounts-using-corporate-credentials/

### Create Migration Tool Configuration File and Prepare Environment

Creates the confiruation file used by the migration tool. The configuration file will be created in the directory `<root-dir>/src/input-config/input-config.json`. This command will also deploy a CloudFormation template and create two CodeCommit repositories. The CloudFormation template will create an S3 bucket for the resource mapping files. The first CodeCommit repository will also be used for the resource mapping files. The second CodeCommit repository will be used for the Landing Zone Accelerator configuration files that will be created in a later step.

### Commands

```
cd <root-dir>
yarn run migration-config
```

### Confirm Outputs

- Navigate to:
  `<rootDir>/src/input-config/input-config.example.json`
- Confirm the values below. It is not expected that these values will be modified:
  - `aseaPrefix` - The ASEA prefix used for ASEA deployed resources. This can be found in the initial ASEA Installer CloudFormation template `Parameters` under `AcceleratorPrefix`. Ex: `ASEA-`
  - `acceleratorName` - The ASEA accelerator name. This can be found as a parameter in the initial ASEA Installer CloudFormation template.
  - `repositoryName` - The ASEA Repository name used to store ASEA Configuration files. This can be found either in the initial ASEA Installer CloudFormation template `Parameters` under `ConfigRepositoryName` or in the CodeCommit Service.
  - `assumeRoleName` - The name of the role which will be assumed during the migration process. Ex: `<prefix-name>-PipelineRole`
  - `parametersTableName` - The name of the DynamoDB Table where ASEA account metadata is stored. This can be found by:
    - Navigating to the DynamoDB service home page
    - Selecting `Tables` from the drop down on the left side of the console.
    - Finding the table name similar to `<prefix-name>-Parameters`.
  - `homeRegion` - Home Region for ASEA. This field can be retrieved from the ASEA Configuration file
  - `mappingBucketName` - Name of the S3 bucket to write the mapping output to. Ex: `asea-lza-resource-mapping-<management-account-id>`
  - `aseaConfigBucketName` - Name of ASEA created phase-0 central bucket, will be used to copy and convert assets for LZA.
  - `operationsAccountId` - Operations Account Id.
  - `installerStackName` - The name of the ASEA installer CloudFormation stack.
  - `centralBucket` - The name of the ASEA Phase 0 configuration bucket. Ex: `asea-managment-phase0-configcentral1-ocqiyas45i27`
  - `mappingRepositoryName` - The name of the CodeCommit repository resource mapping repository. Ex. `ASEA-Mappings`. Do not modify this value.
  - `lzaConfigRepositoryName` - The name of the CodeCommit repository that will store the LZA configuration files. Ex. `ASEA-LZA-config`. Do not modify this value.
  - `lzaCodeRepositorySource` - This value will be used when deploying the LZA installer CloudFormation stack. Ex. `github`
  - `lzaCodeRepositoryOwner` - This value will be used when deploying the LZA installer CloudFormation stack. Ex. `awslabs`
  - `lzaCodeRepositoryName` - This value will be used when deploying the LZA installer CloudFormation stack. Ex. `landing-zone-accelerator-on-aws`
  - `lzaCodeRepositoryBranch` - This value will be used when deploying the LZA installer CloudFormation stack. Ex. `asea-lza-migration`
  - `managementAccountEmail` - This value will be used when deploying the LZA installer CloudFormation stack.
  - `logArchiveAccountEmail` - This value will be used when deploying the LZA installer CloudFormation stack.
  - `auditAccountEmail` - This value will be used when deploying the LZA installer CloudFormation stack.
  - `controlTowerEnabled` - This value will be used when deploying the LZA installer CloudFormation stack. Possible values `Yes` or `No`

### Confirm S3 Bucket CloudFormation Template Deployment

- Navigate to S3 in the AWS Console
- Select the bucket that you created in the previous step
- Click on `Properties` tab
- Ensure that `Bucket Versioning` is enabled
- Ensure that `Default Encryption` is set to `Amazon S3 managed keys (SSE-S3)`
- Click on `Permissions` tab
- Ensure that Block Public Access is enabled
- Ensure that an S3 Bucket Policy is created and validate the bucket policy

### Confirm Creation of 2 CodeCommit Repositorys

- Navigate to CodeCommit in the AWS Console
- Confirm that the CodeCommit repository for resource mapping exists. `<prefix-name>-Mappings`
- Confirm that the CodeCommit repository for LZA configuration exists. `<prefix-name>-LZA-config`

### Disable ASEA Custom Resource Delete Behaviors

To complete the migration process, we will need to disable ASEA Custom Resource deletions. In order to do this, we have added a new parameter called `LZAMigrationEnabled`. Setting this to true during CloudFormation stack update will enable this behavior. In order disable the resources, complete the following:

#### Deploy the migration ASEA Installer Stack

- Checkout the branch `lza-migration` and navigate to the directory which contains the CloudFormation installer template:
  ```
  cd aws-secure-environment-accelerator
  git checkout lza-migration
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
- On the `Specify Stack Details` in the Parameters section update only the parameter named `LZAMigrationEnabled`. Change the value to `true`.
  - Update the parameter named `RepositoryBranch`.  Change the value to `lza-migration`.
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

### Confirm Outputs

After running the `resource-mapping` script, the following artifacts should be generated inside the S3 bucket which has been deployed via CloudFormation and passed in the config file as `mappingBucketName`. This data should also be in the CodeCommit repository `<prefix-name>-LZA-config`:

- Resource Mapping File
- Drift Detection File (per account/per region/per stack)
- Stack Resource File (per account/per region/per stack)
- Aggregate Drift Detection File (All drifted resources)

In order to validate the output artifacts, you should verify that the following files have been created inside the S3 Bucket (_*Output-Mapping-Bucket*_) and CodeCommit repository:

- Resource Mapping File
  - Look for file which matches _*Output-Mapping-File-Name*_ from configuration file.
  - Spot Check that file has correct accounts, regions, and stacks
- Aggregated Drift Detection File
  - Look for a file named `AllDriftDetectedResources.csv`
  - See [Further instructions on analyzing the drift results](docs/DRIFT_HANDLING.md)
- Drift Detection Files
  - For a more granular look at Drift Detection, this is available on an account/region/stack basis as well:
    - Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-drift-detection.csv`
    - See [Further instructions on analyzing the drift results](docs/DRIFT_HANDLING.md)
- Stack Resource List Output
  For each Account, Region, and Stack:
  - Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-resources.csv`
  - Ensure that the resources listed in the CSV file match up with the deployed CloudFormation resources in the stack.

## Custom Resource Drift Detection

### Overview

The above section covers Drift Detection on CloudFormation native resources. However, ASEA and LZA both utilize many Lambda-backed custom-resources as well. To successfully detect drift during the migration process, there is a snapshot tool that records the state of custom resources.
The snapshot tool supports the following commands: - yarn run snapshot pre - yarn run snapshot post - yarn run snapshot report - yarn run snapshot reset
Each subcommand of the snapshot tool and its associated actions can be found below:

- `yarn run snapshot pre` - This command should be run `before` the migration process. Describes all custom resource states before the migration and saves the results in `${aseaPrefix}-config-snapshot`
- `yarn run snapshot post` - This command should be run `after` the migration process. Describes all custom resource states after the migration and saves the results in `${aseaPrefix}-config-snapshot`
- `yarn run snapshot report` - This command should be run `after` the pre and post snapshot commands have been run. Runs a diff on the Pre and Post snapshot resources and outputs a list of the diffs.
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
yarn run snapshot pre
```

### Confirm Outputs

In order to validate the snapshot behaviors, you will need to do the following:

- Navigate to `DynamoDB` in the AWS console.
- Click on `Tables` on the left side of the page.
- On the `Tables` page, select the radio-button next to the table `${aseaPrefix}-config-snapshot`
- Once you have selected the radio-button, click on the `Explore Table Items` button in the top right.

#### Snapshot-Pre

After running the snapshot pre command, ensure that the DynamoDB table `${aseaPrefix}-config-snapshot` has been created. This table should be populated with the following fields: - AccountRegion - ResourceName - PreMigrationJson - PreMigrationHash

## Convert Configuration

### Overview

In order to accomplish the migration, the existing ASEA configuration file needs to be converted into LZA configuration files (https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/using-configuration-files.html). The `convert-config` script parses through the ASEA configuration file and for each resource block does the following:

- Reads in the ASEA configuration object
- Decides the ASEA Object Type
- Maps object and resource metadata file to LZA Object
- Creates proper Deployment Targets for the LZA Object (This defines which accounts the resource will be deployed to)
  Once the entire ASEA configuration file has been converted, the output LZA configuration files will be stored locally in the current directory in a sub-directory named `outputs\lza-config`. The files will also be created in the CodeCommit repository name `<prefix-name>-LZA-config`

### Commands

```
cd <root-dir>
yarn run convert-config
```

#### Manual Changes

There are manual changes and verification to be performed on LZA Configuration generated by config converter script. Edit the files in the CodeCommit repository named `<prefix-name>-LZA-config`.

**Disable Route Table for Subnet configuration (In vpcs and vpcTemplates):**

During migration LZA creates new Subnet Route Tables. To avoid network outage for existing applications comment `routeTable` association to existing subnet. Config converted fills route tables in subnet definitions to make it easy for future deployments.

Comment routeTable in `network-config.yaml` from `vpcs.subnets.routeTable`

**Disable Subnet Associations to NACLs (In vpcs and vpcTemplates):**

During migration LZA creates new NACLs. To avoid network outage disable subnetAssociations to nacl in initial execution and enable them in the next execution after verifying rules.

Comment `subnetAssociations` in `vpcs.networkAcls.subnetAssociations: []`

e.g:

```
networkAcls:
      - name: Data_Central_nacl
        subnetAssociations: []
          # - Data_Central_aza_net
          # - Data_Central_azb_net
          # - Data_Central_azd_net
```

**Disable VPC Interface Endpoints (In vpcs and vpcTemplates):**
During migration LZA creates new VPC Interface Endpoints. To avoid recreating VPC InteraceEndpoints, we will need to comment out the following in NetworkConfig.yaml and add an empty array:

```
endpoints in vpcs.interfaceEndpoints.endpoints
```

Note: We can still create VPC Interface Endpoints natively from LZA.

```
vpcs:
  - name: Endpoint_vpc
    account: shared-network
    cidrs:
      - 10.0.0.0/22
    region: ca-central-1
    defaultSecurityGroupRulesDeletion: true
    enableDnsHostnames: true
    enableDnsSupport: true
    instanceTenancy: default
    interfaceEndpoints:
      defaultPolicy: Default
      endpoints:[]
        # - service: ec2
        # - service: ec2messages
        # - service: ssm
        # - service: ssmmessages
```

### Confirm Outputs

After running the `convert-config` script, the following artifacts should be generated in the current directory in a subdirectory named `outputs/lza-config` and in the CodeCommit repository named `<prefix-name>-LZA-config`:

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


### Prepare ASEA Environment

#### Overview

This step will prepare the ASEA environment for migration to the Landing Zone Accelerator on AWS. In this step the migration scripts tool will be deleting the CDK Toolkit CloudFormation stacks in the Management account. Which includes deleting ECR images from the CDK Toolkit ECR repository. Deleting the ASEA CloudFormation installer stack and finally the ASEA InitialSetup stack. You will also be emptying the ASEA assets bucket in order for the installer CloudFormation stack to be deleted.
In order to empty the artifacts S3 bucket you will need to navigate to S3 console.

    * Find the bucket that has the string `artifactsbucket in the name`
    * Click the radio button next to the bucket
    * Click the `Empty` button in the upper right
    * Type the string `permanently delete` in the confirmation text box
    * Click the `Empty` button
    * Wait until a green bar appears with the text `Successfully emptied bucket`
    * Switch back to you Cloud 9 environment and run the commands below

#### Commands

```
cd <root-dir>
yarn run asea-prep
```

## Installing the Landing Zone Accelerator

### Installing the LZA Pipeline

You are ready to deploy AWS Landing Zone Accelerator. This step will deploy a CloudFormation template creates two AWS CodePipeline pipelines, an installer and the core deployment pipeline, along with associated dependencies. This solution uses AWS CodeBuild to build and deploy a series of CDK-based CloudFormation stacks that are responsible for deploying supported resources in the multi-account, multi-Region environment. The CloudFormation template will first create the `${prefix-name}-Installer`, which in turn will create the accelerator pipeline, `${prefix-name}-Pipeline`

- For more details on the deployment pipelines, take a look here:
  https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deployment-pipelines.html

#### Commands

```
cd <root-dir>
yarn run lza-prep
```

### Confirm

Navigate to the AWS CloudFormation console and confirm that the stack named `<prefix-name>-Installer` deployed successfully.

### Run the LZA Pipeline

- For general LZA Pipeline deployment details, refer to the LZA Implementation Guide here: https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html
- During the Landing Zone Accelerator pipeline deployment, there are two ASEA migration specific stages `ImportAseaResources` and `PostImportAseaResources`. These two stages allow the LZA to manage and interact with resources that were originally managed in the scope of ASEA.
  - `ImportAseaResources` - This stage uses the `CFNInclude` module to include the original ASEA Managed CloudFormation resources. This allows the resources to be managed in the context of the LZA CDK Application. SSM Parameters are created for these resources so that they can be interacted with during the LZA Pipeline run.
  - `PostImportAseaResources` - This stage runs at the end of the LZA Pipeline, it allows the LZA pipeline to modify original ASEA Managed Cloudformation resources. This requires a seperate stage because it allows the prior LZA stages to interact with ASEA resources and then modifies all ASEA resources (as opposed to CFN Including the ASEA resources in every stage).

## ASEA to LZA Migration Rollback Strategy

### Overview

The existing ASEA to LZA upgrade process relies on a combination of automated and manual mechanisms to accomplish the upgrade. This is due to AWS service limits as well as resource collisions of resources which exist in both the ASEA and LZA solutions.

## Problems

If an issue occurs during the upgrade process, there needs to be a rollback plan in place. Since the migration process utilizes both automated and manual steps, we will roll back in an automated fashion where possible and require manual steps for others. The high-level rollback steps are below.

### Rollback Steps

- Delete the `${Prefix}-CDK-Toolkit` in both the `$HOME_REGION` and `$GLOBAL_REGION`
- For `$HOME_REGION`
  - Navigate to the CloudFormation homepage
  - In the top right corner, select your `$HOME_REGION` from the region selector drop down.
  - In the CloudFormation dashboard, locate and select the `${Prefix}-CDK-Toolkit` stack
  - Click on the Delete button.
- For `$GLOBAL_REGION`:
  - Navigate to the CloudFormation service homepage
  - In the top right corner, select your `$GLOBAL_REGION` from the region selector drop down.
  - In the CloudFormation dashboard, locate and select the `${Prefix}-CDK-Toolkit` stack.
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
  - After deploying the CloudFormation template, a new CodePipeline pipeline will be created. This Pipeline will be called `{$Prefix}-InstallerPipeline`. - The Code Pipeline will automatically trigger an execution and begin running when created
  - This pipeline runs a CodeBuild job which does a number of things – most importantly, create the ASEA State Machine.
  - Run the ASEA State Machine
  - After the InstallerPipeline has successfully run, the ASEA State Machine will be kicked off which will ensure that ASEA features are rolled back to match the ASEA configuration.
- Cleanup LZA and associated resources https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/uninstall-the-solution.html

## Post AWS LZA Deployment

### Overview

At this point the migration to LZA is complete. Further updates to the environment will require updating the LZA configuration and then executing the LZA pipeline. The custom resource snapshot migration tool may be executed to report on any changes.

#### Post Migration Snapshot

To create the post migration snapshot you will be using the migration tools in your Cloud 9 environment again. There are two steps. The first step will update the snapshot DynamoDb with the configuration of the resources post migration. After updating the resources you will run another command to report on the differences.

### Commands

```
cd <root-dir>
yarn run snapshot post
```

After running the snapshot post command, ensure that the DynamoDB table `${aseaPrefix}-config-snapshot` has been updated. This table should be populated with the following fields: - AccountRegion - ResourceName - PreMigrationJson - PreMigrationHash - PostMigrationJson - PostMigrationHash

#### Post Migration Snapshot Report

This command will generate a report that shows any difference in configuration of the monitored resources.

### Commands

```
cd <root-dir>
yarn run snapshot report
```

#### Snapshot Reset

Once you are satisfied that the migration is successful you can delete the snapshot data. You may retain this data as long as you would like. The data is stored in a DynamoDb table and will only be charged for the storage.

### Commands

```
cd <root-dir>
yarn run snapshot reset
```

### Post migration

#### Overview

This step will perform post migration actions which includes following

- Copy ASEA ACM Certificate assets from ASEA Central Bucket to LZA created Assets bucket.

#### Commands

```
cd <root-dir>
yarn run post-migration
```

## Troubleshooting

### Failure in ImportASEAResourceStage
If the LZA pipeline fails in the ImportASEAResources stage and you need to restart the pipeline from the begininng.  You will need to remove a file from the asea-lza-resource-mapping-<accountId> bucket. The name of the file is `asearesources.json`.  Download a copy of the file and then delete it from the S3 bucket.  The file will be recreated when the pipeline is rerun.

---
