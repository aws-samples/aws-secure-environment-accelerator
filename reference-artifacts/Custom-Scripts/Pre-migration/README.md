# ASEA to LZA Upgrade (Alpha)

## Overview

In order to perform a successful upgrade, there are a number of tasks that customers must complete before the upgrade can begin. The first task is generating the configuration file for the upgrade tool. Followed by steps that are necessary to ensure that all ASEA resources deployed are in the correct state, by updating ASEA to the latest version, and evaluating and manually remediating the resource drift of resources deployed by ASEA using the provided upgrade scripts. Once the resources are remediated, customers will then enable a new configuration option in the ASEA configuration that will execute the ASEA state machine to prepare the environment by only removing resources that are necessary to run ASEA state machine deployments, and other ASEA specific tasks. This last run will also effectively disable all ASEA CloudFormation custom resources from modifying any of the resources that have been deployed. After the final ASEA state machine run, the ASEA installer stack can be removed from the environment to completely disable ASEA and remove the state machine.

Once the installer stack has been removed, the customer will then run a script that will create a snapshot of every resource in every account and region that ASEA has deployed, and store that file in S3 and CodeCommit. This snapshot will be used by the LZA to identify ASEA specific resources that must be modified or referenced in later stages for dependencies. Once the mapping file is generated, the LZA configuration file generation script can also be run. This file in conjunction with the snapshot generated above, will be used to create the LZA configuration files that will be used to reference the ASEA generated resources.

After the configuration files are generated, these files will be placed in a CodeCommit repository residing in the home installation region of ASEA. Then, the LZA can be installed and reference the configuration repository created above. During the installation, the LZA will reference the newly created configuration, and the pipeline will install two additional stages. The first stage created will evaluate and created references that the LZA specific stacks can reference based off of configuration changes. This stage is executed before any core LZA stages are executed. The last stage created for migrated environments is executed after all LZA stages are executed. This stage is responsible for adding dependencies created by the LZA to ASEA stacks to ensure that all resources are handled correctly during the execution of the LZA CodePipeline.

Once the LZA is installed, customers resources will continue to exist and are still modifiable, but interaction with ASEA resources are handled specifically through the LZA configuration files. Management of LZA native environments and upgraded environments should see almost no difference between the configuration files in these environments.

The upgrade from ASEA to LZA has the following steps:

- [Preparation](#preparation)
  1. [Pre-requisites](#prerequisites)
  2. [Configuration](#configuration)
  3. [Resource mapping and drift detection](#resource-mapping-and-drift-detection-scripts)
  4. [Configuration conversion](#convert-configuration)
- [Upgrade](#asea-to-lza-upgrade)
  1. [Disable ASEA](#disable-and-uninstall-asea)
  2. [Install LZA](#installing-the-landing-zone-accelerator)
  3. [Post-deployment steps](#post-aws-lza-deployment)
- [Rollback strategy](#asea-to-lza-upgrade-rollback-strategy)
- [Troubleshooting](#troubleshooting)

The preparation steps can be done in advance, can be run multiple times and will not modify your current environment. The upgrade steps should be completed when you are ready to apply the upgrade to your environment.

# Preparation

## Prerequisites

- You are running the latest version of ASEA. If you are not running version 1.5xx then upgrade before starting the upgrade process
- You can run the scripts from your local workstation
  - You will need Git, the AWS CLI, NodeJS and Yarn installed
- Alternatively you can use Cloud9 which has most tools pre-installed
  - Deploy Cloud9 VPC and Setup Cloud9 Environment following instructions here: <https://catalog.workshops.aws/landing-zone-accelerator/en-US/workshop-advanced/lza-best-practices/create-ide-environment/setup-cloud9-environment>
  - Ensure you are logged into the Cloud9 terminal
- Complete the `Verify and configure software tools` section to ensure Yarn is installed

### Clone The ASEA Repo

In order to prepare the ASEA environment for upgrade you will need to clone the ASEA GitHub repository:
<https://github.com/aws-samples/aws-secure-environment-accelerator.git>

```bash
git clone https://github.com/aws-samples/aws-secure-environment-accelerator.git
```

### Install the upgrade scripts project dependencies and build the project

- Ensure you are still on the `lza-migration` branch and navigate to the directory which contains the upgrade scripts:

  ```bash
  cd aws-secure-environment-accelerator
  git checkout lza-migration
  cd reference-artifacts/Custom-Scripts/Pre-migration/src
  ```

- Install dependencies and build the project:

  ```bash
  yarn install
  yarn build
  ```

Note: The `<root-dir>` placeholder in further instructions in this document corresponds to the current working directory.

## Configuration

### Retrieve Temporary IAM Credentials via AWS Identity Center

Prior to running the pre-upgrade scripts, you will need temporary IAM credentials in order to run the script. In order to retrieve these, follow the instructions here and set the temporary credentials in your environment:
<https://aws.amazon.com/blogs/security/aws-single-sign-on-now-enables-command-line-interface-access-for-aws-accounts-using-corporate-credentials/>

### Create Upgrade Tool Configuration File and Prepare Environment

Creates the configuration file used by the upgrade tool. The configuration file will be created in the directory `<root-dir>/src/input-config/input-config.json`.

```bash
cd <root-dir>
yarn run migration-config
```

<details>
  <summary>Detailed information</summary>
  This command will also deploy a CloudFormation template and create two CodeCommit repositories. The CloudFormation template will create an S3 bucket for the resource mapping files. The first CodeCommit repository will also be used for the resource mapping files. The second CodeCommit repository will be used for the Landing Zone Accelerator configuration files that will be created in a later step.

To skip the creation of these resources and only generate the local configuration file, you can use the `local-update-only` argument.

```bash
yarn run migration-config local-update-only
```

</details>

### Confirm Outputs

Navigate to `<rootDir>/src/input-config/input-config.json` and confirm the file has been generated with values corresponding to your environment. It is not expected that these values will need to be modified.

Two CodeCommit repositories have been created

- `<prefix-name>-Mappings` to store resource mapping
- `<prefix-name>-LZA-config` to store LZA configuration

<details>
  <summary>Detailed documentation of input-config.json</summary>

- `aseaPrefix` - The ASEA prefix used for ASEA deployed resources. This can be found in the initial ASEA Installer CloudFormation template `Parameters` under `AcceleratorPrefix`. Ex: `ASEA-`
- `acceleratorName` - The ASEA accelerator name. This can be found as a parameter in the initial ASEA Installer CloudFormation template.
- `repositoryName` - The ASEA Repository name used to store ASEA Configuration files. This can be found either in the initial ASEA Installer CloudFormation template `Parameters` under `ConfigRepositoryName` or in the CodeCommit Service.
- `assumeRoleName` - The name of the role which will be assumed during the upgrade process. Ex: `<prefix-name>-PipelineRole`
- `parametersTableName` - The name of the DynamoDB Table where ASEA account metadata is stored. This can be found by:
  - Navigating to the DynamoDB service home page
  - Selecting `Tables` from the drop down on the left side of the console.
  - Finding the table name similar to `<prefix-name>-Parameters`.
- `homeRegion` - Home Region for ASEA. This field can be retrieved from the ASEA Configuration file
- `mappingBucketName` - Name of the S3 bucket to write the mapping output to. Ex: `asea-lza-resource-mapping-<management-account-id>`
- `aseaConfigBucketName` - Name of ASEA created phase-0 central bucket, will be used to copy and convert assets for LZA.
- `operationsAccountId` - Operations Account Id.
- `installerStackName` - The name of the ASEA installer CloudFormation stack.
- `centralBucket` - The name of the ASEA Phase 0 configuration bucket. Ex: `asea-management-phase0-configcentral1-ocqiyas45i27`
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

</details>

## Resource Mapping and Drift Detection Scripts

> **⚠️ Warning**: When ready to apply the upgrade you will need to re-run the resource mapping or if you make changes to ASEA resources to fix drifted resources.

### Overview

The Resource Mapping script will generate the ASEA mapping file which will be used throughout the ASEA to LZA Upgrade process. In order to accomplish this task, the script needs to do the following:

- Ensure that the S3 Bucket exists and has proper object versioning enabled
- Retrieve all ASEA Enabled Regions from the ASEA Configuration File.
- Retrieve all ASEA Enabled Accounts from the ASEA Parameters Table.
- Assume a role into each account and create a unique AWS CloudFormation client for each environment (region/account combination). For each unique environment:
  - List every CloudFormation Template associated with ASEA (This is a filtered down list operation)
  - List every Resource that is associated with the CloudFormation Template.
  - Detect Drift on each individual resource
- The outputs of these will be saved in the S3 Bucket.

### Resource Mapping Commands

```bash
cd <root-dir>
yarn run resource-mapping
```

### Confirm Resource Mapping Outputs

After running the `resource-mapping` script, the following artifacts should be generated inside the S3 bucket which has been deployed via CloudFormation and passed in the config file as `mappingBucketName`. This data should also be in the CodeCommit repository `<prefix-name>-LZA-config`:

- Resource Mapping File
- Drift Detection File (per account/per region/per stack)
- Stack Resource File (per account/per region/per stack)
- Aggregate Drift Detection File (All drifted resources)

The file `AllDriftDetectedResources.csv` contains an aggregate of resources that have drifted from their original configuration. See [Further instructions on analyzing the drift results](docs/DRIFT_HANDLING.md)

In order to validate the output artifacts, you should verify that the following files have been created inside the S3 Bucket (_*Output-Mapping-Bucket*_) and CodeCommit repository:

<details>
  <summary>Detailed information for drift files</summary>

- Resource Mapping File
  - Look for file which matches _*Output-Mapping-File-Name*_ from configuration file.
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
  </details>

## Convert Configuration

### Convert Configuration Overview

In order to accomplish the upgrade, the existing ASEA configuration file needs to be converted into LZA configuration files (<https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/using-configuration-files.html>). The `convert-config` script parses through the ASEA configuration file and for each resource block does the following:

- Reads in the ASEA configuration object
- Decides the ASEA Object Type
- Maps object and resource metadata file to LZA Object
- Creates proper Deployment Targets for the LZA Object (This defines which accounts the resource will be deployed to)
  Once the entire ASEA configuration file has been converted, the output LZA configuration files will be stored locally in the current directory in a sub-directory named `outputs\lza-config`. The files will also be created in the CodeCommit repository name `<prefix-name>-LZA-config`

### Convert Configuration Commands

```bash
cd <root-dir>
yarn run convert-config
```

<details>
  <summary>Option to generate files locally only</summary>

If you used the `local-update-only` in the [configuration step](#configuration), you should also use the `local-update-only` with the convert-config command to generate the files locally only as the CodeCommit repo wasn't created. This can be useful in your early preparation phase to validate the generated configuration without impacting your environment.

```bash
yarn run convert-config local-update-only
```

</details>

> **⚠️ Note**: If an ASEA account resides in an Organizational Unit which is in the `ignored-ous` section of `global-config` block, that account will not be added to the resulting `accounts-config.yaml` output file. This is due to the way that the LZA handles accounts which it manages as well as logic in the config validator.

#### Convert Configuration Validations

During the upgrade process, the LZA creates new Subnet Route Tables and NACLs (if they are defined in your current environment). To avoid network outages for existing applications, the `convert-config` script creates new Route Tables and NACLs, however they are not attached by default. These Route Table and NACL associations need to be manually verified before being attached.

To achieve this, we output two different versions of the network-config.yaml file:

- `network-config.yaml`
- `network-config-with-subnet-associations-and-route-tables.yaml`

The `network-config.yaml` file has an empty array for `networkAcl.subnetAssociations` and an undefined value for `subnets.routeTable`. While the `network-config-with-subnet-associations-and-route-tables.yaml` has the properly generated values for attaching the NACLs and Route Tables. This will be described in more detail in the `Run the LZA Pipeline` section later in the README.

### Confirm Convert Configuration Outputs

After running the `convert-config` script, the following artifacts should be generated in the current directory in a subdirectory named `outputs/lza-config` and in the CodeCommit repository named `<prefix-name>-LZA-config`:

- Configuration Files
  - `accounts-config.yaml`
  - `global-config.yaml`
  - `iam-config.yaml`
  - `network-config.yaml`
  - `network-config-with-subnet-associations-and-route-tables.yaml`
  - `organization-config.yaml`
  - `security-config.yaml`
- Dynamic Partitioning preferences
  - `dynamic-partitioning/log-filters.json`
- IAM Policies
  - `iam-policies/*`
- Service Control Policies (SCPs)
  - `service-control-policies/*`
- SSM Documents
  - `ssm-documents/*`

### Validating LZA configuration files

LZA has a tool to validate your configuration files. We strongly recommend you run this tool on the generated LZA configuration file to spot any errors.

See [Configuration Validator](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#configuration-validator) section in the LZA developer guide.

> **⚠️ Warning**: Stop here if you were only running preparation steps and are not ready yet to proceed with the ASEA to LZA upgrade.

# ASEA to LZA Upgrade

Before starting the upgrade process you need to make sure you recently went through all the preparation steps and have a copy of your LZA configurations files in the CodeCommit repository named `<prefix-name>-LZA-config`.

Confirm you are on the latest ASEA version and that the last state machine execution was successful.

> **⚠️ Warning**: The following steps will start applying changes to your environment by uninstalling ASEA and installing LZA. Only move ahead when ready to go through the full upgrade.

## Disable and uninstall ASEA

### Disable ASEA Custom Resource Delete Behaviors

To complete the upgrade process, we will need to disable ASEA Custom Resource deletions. In order to do this, we have added a new parameter called `LZAMigrationEnabled`. Setting this to true during CloudFormation stack update will enable this behavior. In order disable the resources, complete the following:

#### Deploy the upgrade ASEA Installer Stack

- Checkout the branch `lza-migration` and navigate to the directory which contains the CloudFormation installer template:

  ```bash
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
  - Update the parameter named `RepositoryBranch`. Change the value to `lza-migration`.
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

### Re-run resource mapping script

When the `ASEA-MainStateMachine_sm` has completed successfully, re-run the [resource mapping script](#resource-mapping-and-drift-detection-scripts).

```bash
cd <root-dir>
yarn run resource-mapping
```

### Custom Resource Drift Detection

#### Custom Resource Drift Detection Overview

The above section covers Drift Detection on CloudFormation native resources. However, ASEA and LZA both utilize many Lambda-backed custom-resources as well. To successfully detect drift during the upgrade process, there is a snapshot tool that records the state of custom resources.
The snapshot tool supports the following commands:

- yarn run snapshot pre
- yarn run snapshot post
- yarn run snapshot report
- yarn run snapshot reset

<details>
  <summary>Detailed information about snapshot commands</summary>

Each subcommand of the snapshot tool and its associated actions can be found below:

- `yarn run snapshot pre` - This command should be run `before` the upgrade process. Describes all custom resource states before the upgrade and saves the results in `${aseaPrefix}-config-snapshot`
- `yarn run snapshot post` - This command should be run `after` the upgrade process. Describes all custom resource states after the upgrade and saves the results in `${aseaPrefix}-config-snapshot`
- `yarn run snapshot report` - This command should be run `after` the pre and post snapshot commands have been run. Runs a diff on the Pre and Post snapshot resources and outputs a list of the diffs.
- `yarn run snapshot reset` - Deletes the DynamoDB table `${aseaPrefix}-config-snapshot`

In order to do this, the tool does the following:

- Creates DynamoDB table in the `${homeRegion}` to store snapshot data. The table is named `${aseaPrefix}-config-snapshot`:
- Assume a role into each account and makes AWS api calls to describe the state of each service managed by a custom resources. In each account/region:
  - For each custom resource type, retrieve associated AWS resource, attributes, and state
- The data will then be stored in the DynamoDB table with the following fields:
  - `AccountRegion` - `${AccountKey}:${Region}` key to identify what account and region the resource lives in
  - `ResourceName` - Custom Resource Id
  - `PreMigrationJson` (Created after snapshot pre) - This field contains the metadata and state of the resource(s) associated with the Custom Resource prior to the upgrade.
  - `PreMigrationHash` (Created after snapshot pre) - This field contains a hashed value of the pre-upgrade json.
  - `PostMigrationJson` (Created after snapshot post) - This field contains the metadata and state of the resource(s) associated with the Custom Resource after the upgrade is complete.
  - `PostMigrationHash` (Created after snapshot post) - This field contains a hashed value of the post-upgrade json.
  </details>

#### Custom Resource Drift Detection Commands

```bash
cd <root-dir>
yarn run snapshot pre
```

#### Confirm Custom Resource Drift Detection Outputs

In order to validate the snapshot behaviors, you will need to do the following:

- Navigate to `DynamoDB` in the AWS console.
- Click on `Tables` on the left side of the page.
- On the `Tables` page, select the radio-button next to the table `${aseaPrefix}-config-snapshot`
- Once you have selected the radio-button, click on the `Explore Table Items` button in the top right.
- This table should be populated with the following fields:
  - AccountRegion
  - ResourceName
  - PreMigrationJson
  - PreMigrationHash

### Prepare ASEA Environment

#### Prepare ASEA Environment Overview

This step will prepare the ASEA environment for upgrade to the Landing Zone Accelerator on AWS. In this step the upgrade scripts tool will delete the CDK Toolkit CloudFormation stacks in the Management account. Which includes deleting ECR images from the CDK Toolkit ECR repository. Deleting the ASEA CloudFormation installer stack and finally the ASEA InitialSetup stack. You will also be emptying the ASEA assets bucket in order for the installer CloudFormation stack to be deleted.
In order to empty the artifacts S3 bucket you will need to navigate to S3 console.

- Find the bucket that has the string `artifactsbucket in the name`
- Click the radio button next to the bucket
- Click the `Empty` button in the upper right
- Type the string `permanently delete` in the confirmation text box
- Click the `Empty` button
- Wait until a green bar appears with the text `Successfully emptied bucket`
- Switch back to your Cloud9 environment and run the commands below

#### Prepare ASEA Environment Commands

```bash
cd <root-dir>
yarn run asea-prep
```

## Installing the Landing Zone Accelerator

### Installing the LZA Pipeline

You are ready to deploy AWS Landing Zone Accelerator. This step will deploy a CloudFormation template creates two AWS CodePipeline pipelines, an installer and the core deployment pipeline, along with associated dependencies. This solution uses AWS CodeBuild to build and deploy a series of CDK-based CloudFormation stacks that are responsible for deploying supported resources in the multi-account, multi-Region environment. The CloudFormation template will first create the `${prefix-name}-Installer`, which in turn will create the accelerator pipeline, `${prefix-name}-Pipeline`

- For more details on the deployment pipelines, take a look here:
  <https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deployment-pipelines.html>

#### Installing the LZA Pipeline Commands

```bash
cd <root-dir>
yarn run lza-prep
```

### Installing the LZA Pipeline Confirmation

Navigate to the AWS CloudFormation console and confirm that the stack named `<prefix-name>-Installer` deployed successfully.

### Run the LZA Pipeline

- For general LZA Pipeline deployment details, refer to the LZA Implementation Guide here: <https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html>
- During the Landing Zone Accelerator pipeline deployment, there are two ASEA upgrade specific stages `ImportAseaResources` and `PostImportAseaResources`. These two stages allow the LZA to manage and interact with resources that were originally managed in the scope of ASEA.
  - `ImportAseaResources` - This stage uses the `CFNInclude` module to include the original ASEA Managed CloudFormation resources. This allows the resources to be managed in the context of the LZA CDK Application. SSM Parameters are created for these resources so that they can be interacted with during the LZA Pipeline run.
  - `PostImportAseaResources` - This stage runs at the end of the LZA Pipeline, it allows the LZA pipeline to modify original ASEA Managed Cloudformation resources. This requires a separate stage because it allows the prior LZA stages to interact with ASEA resources and then modifies all ASEA resources (as opposed to CFN Including the ASEA resources in every stage).
- In order to support attachments of NACLs and Route Tables, the first run of the LZA pipeline should be run as is, with the generated `network-config.yaml` file.
  - Once the original pipeline has run, the NACLs and Route Tables should be attached by running the LZA pipeline a second time. However, before running the pipeline, the contents of the file `network-config-with-subnet-associations-and-route-tables.yaml` should be copy and pasted into the `network-config.yaml` file in CodeCommit.

## Post AWS LZA Deployment

### Post AWS LZA Deployment Overview

At this point the upgrade to LZA is complete. Further updates to the environment will require updating the LZA configuration and then executing the LZA pipeline. The custom resource snapshot upgrade tool may be executed to report on any changes.

#### Post Upgrade Snapshot

To create the post upgrade snapshot you will be using the upgrade tools in your Cloud9 environment again. There are two steps. The first step will update the snapshot DynamoDb with the configuration of the resources post upgrade. After updating the resources you will run another command to report on the differences.

#### Post AWS LZA Deployment Commands

```bash
cd <root-dir>
yarn run snapshot post
```

After running the snapshot post command, ensure that the DynamoDB table `${aseaPrefix}-config-snapshot` has been updated. This table should be populated with the following fields:

- AccountRegion
- ResourceName
- PreMigrationJson
- PreMigrationHash
- PostMigrationJson
- PostMigrationHash

#### Post Upgrade Snapshot Report

This command will generate a report that shows any difference in configuration of the monitored resources.

#### Post Upgrade Snapshot Report Commands

```bash
cd <root-dir>
yarn run snapshot report
```

#### Snapshot Reset

Once you are satisfied that the upgrade is successful you can delete the snapshot data. You may retain this data as long as you would like. The data is stored in a DynamoDb table and will only be charged for the storage.

#### Snapshot Reset Commands

```bash
cd <root-dir>
yarn run snapshot reset
```

### Post upgrade

#### Post upgrade Overview

This step will perform post upgrade actions which includes following

- Copy ASEA ACM Certificate assets from ASEA Central Bucket to LZA created Assets bucket. `copy-certificates`
- Delete Outputs from ASEA stacks. `remove-stack-outputs`
- Update NACL associations. `update-nacl-associations`
- Marks duplicate SNS Topics, Subscriptions and Policies for removal. `remove-sns-resources`
- Marks duplicate Config Rules and Remediation Configurations for removal. `remove-asea-config-rules`
- Marks duplicate RSyslog resources for removal. `remove-rsyslog`

Each of the above steps has a corresponding flag that can be set during the post-migration step. These flags determine which actions are performed by the post-migration step.

#### Post upgrade Commands

```bash
cd <root-dir>
yarn run post-migration remove-stack-outputs copy-certificates update-nacl-associations remove-sns-resources remove-asea-config-rules remove-rsyslog
```

### ALB IP Forwarder

If you are using ALB IP Forwarding in ASEA, (`"alb-forwarding": true` is set for a VPC in the ASEA configuration file), the following will occur as a result of the config-converter script:

- The AlbIpForwardingStack.template.json CloudFormation stack will be added to the LZA Configuration CodeCommit repository under the cloudformation path. ex: cloudformation/AlbIpForwardingStack.template.json
- The VPC Name containing the front-end ALBs will be determined (i.e. Perimeter VPC)
- A `customizations-config.yaml` file will be generated in the LZA Configuration CodeCommit repository in the root directory.
- In the `customizations-config.yaml` file, the following entry will be added for each VPC with ALB Forwarding enabled to the `customizations/cloudFormationStacks` section of the configuration:

```
    - name: <AcceleratorPrefix>-AlbIPForwardingStack
      template: cloudformation/AlbIpForwardingStack.template.json
      runOrder: 1
      parameters:
        - name: acceleratorPrefix
          value: <AcceleratorPrefix>
        - name: vpcName
          value: <VPC_NAME>
        terminationProtection: true
        deploymentTargets:
          accounts:
            - Perimeter
        regions:
          - ca-central-1
```

Once the Customizations stage of the pipeline has been successfully run with the configuration file above, a new DynamoDB table will be generated in the `deploymentTargets` account and region specified. This table should be named `Alb-Ip-Forwarding-<VPC_NAME>`. In the same region and account, a DynamoDB table named `
<ASEA-Prefix>-Alb-Ip-Forwarding-<VPC-ID>` should exist. You will need to copy over all of these entries from the old ALB IP Forwarding table to the new one.

**TODO** provide a command to do this copy

### Gateway Load Balancer

If you are using Gateway Load Balancers (GWLB) in ASEA, (`"type: "GWLB"` is set for one of your Load Balancers in the `alb` configuration), the configuration tool will not map the existing GWLB in ASEA to the LZA configuration. If you're looking to implement GWLBs in your environment, you can do so by referencing the central network services [configuration](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.CentralNetworkServicesConfig.html) within LZA. The LZA configuration allows end-users to define multiple GWLBs and VPC and subnets of where these resources are provisioned. End-users can also define which subnets the service endpoints are distributed to.

To set up GWLBs in your LZA environment, reference the `network-config.yaml` file and specify the `gatewayLoadBalancers` configuration within the `centralNetworkServices` configuration:

```
gatewayLoadBalancers:
  - name: <AcceleratorPrefix>-GWLB
    subnets:
      - Network-Inspection-Firewall-A
      - Network-Inspection-Firewall-B
    vpc: Network-Inspection
    deletionProtection: true
    endpoints:
      - name: Endpoint-A
        account: Network
        subnet: Network-Inspection-A
        vpc: Network-Inspection
      - name: Endpoint-B
        account: Network
        subnet: Network-Inspection-B
        vpc: Network-Inspection

```

### Gateway Load Balancer Endpoint Routes

To specify routes to the GWLB for inspection, reference the Subnet route tables [configuration](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.RouteTableEntryConfig.html) within LZA, for example taking in the above configuration:

```
- name: GwlbRoute
  destination: 0.0.0.0/0
  type: gatewayLoadBalancerEndpoint
  target: Endpoint-A
```

### Custom IAM Role Trust Policies

The LZA solution supports multiple types of assumeRole policies. The following are supported with their respective LZA configurations, particularly as it relates to the `assumedBy` property for the IAM Role set configuration:

##### Using a policy to delegate access to AWS services:

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "elasticmapreduce.amazonaws.com",
          "datapipeline.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

LZA configuration:

```
- name: EC2-Role
  instanceProfile: true
  assumedBy:
    - type: service
      principal: elasticmapreduce.amazonaws.com
    - type: service
      principal: datapipeline.amazonaws.com
  policies:
    awsManaged:
      - AmazonElasticMapReduceFullAccess
      - AWSDataPipeline_PowerUser
      - CloudWatchAgentServerPolicy
  boundaryPolicy: Default-Boundary-Policy
```

##### Using a policy to delegate access to all principals in an account.

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:root"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

LZA configuration:

```
- name: EC2-Readonly-Role
  assumedBy:
    - type: account
      principal: '123456789012'
  policies:
    awsManaged:
      - AmazonEC2ReadOnlyAccess
```

##### Using a policy to delegate access to cross-account principals

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/test-access-role"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

LZA configuration:

```
- name: Network-Security-Role
  assumedBy:
    - type: principalArn
      principal: 'arn:aws:iam::444455556666:role/test-access-role'
  policies:
    awsManaged:
      - AmazonSSMManagedInstanceCore
      - AmazonEC2ReadOnlyAccess
  boundaryPolicy: Default-Boundary-Policy
```

##### Using a policy to provide 3rd party access via external ID conditionals

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/test-access-role"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "111122223333",
        },
      },
    }
  ]
}
```

LZA configuration:

```
- name: Network-Security-Role
  assumedBy:
    - type: principalArn
      principal: 'arn:aws:iam::444455556666:role/test-access-role'
  externalIds:
    - 111122223333
  policies:
    awsManaged:
      - AmazonSSMManagedInstanceCore
      - AmazonEC2ReadOnlyAccess
  boundaryPolicy: Default-Boundary-Policy
```

#### Using a SAML Provider to Federate:

```
{
    "Version": "2012-10-17",
    "Statement": {
      "Effect": "Allow",
      "Action": "sts:AssumeRoleWithSAML",
      "Principal": {"Federated": "arn:aws:iam::account-id:saml-provider/Test-SAML"},
      "Condition": {"StringEquals": {"SAML:aud": "https://signin.aws.amazon.com/saml"}}
    }
  }

```

LZA Configuration:

```
providers:
  - name: Test-SAML
    metadataDocument: path/to/metadata.xml

- name: Network-Security-Role
  assumedBy:
    - type: provider
      principal: Test-SAML
  externalIds:
    - 111122223333
  policies:
    awsManaged:
      - AmazonSSMManagedInstanceCore
      - AmazonEC2ReadOnlyAccess
  boundaryPolicy: Default-Boundary-Policy
```

If an assume role policy is needed outside of the scope of what's natively supported in LZA, it's recommended to lean on LZA to provision the IAM Role and trust policy through the customizations layer:

- Create your own CloudFormation template and add it to the `customizations-config.yaml` file, which will be generated in the LZA Configuration CodeCommit repository in the root directory.

### Public Hosted Zones

As of right now, LZA only supports the creation of private hosted zones in association with creating Vpc Interface Endpoints (for centralized distribution) as well as for Route 53 Resolver Rules. If using public hosted zones for Route53 resolver rules, the public hosted zone and associated Route53 Resolver will have to be created via customizations and along with the functionality to automate the authorization and association of the rule to the requisite VPCs.

- Create your own CloudFormation template and add it to the `customizations-config.yaml` file, which will be generated in the LZA Configuration CodeCommit repository in the root directory.

## ASEA to LZA Upgrade Rollback Strategy

### Rollback Strategy Overview

The existing ASEA to LZA upgrade process relies on a combination of automated and manual mechanisms to accomplish the upgrade. This is due to AWS service limits as well as resource collisions of resources which exist in both the ASEA and LZA solutions.

If an issue occurs during the upgrade process, there needs to be a rollback plan in place. Since the upgrade process utilizes both automated and manual steps, we will roll back in an automated fashion where possible and require manual steps for others. The high-level rollback steps are below.

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
  - Download the Installer Stack from: <https://github.com/aws-samples/aws-secure-environment-accelerator/releases>
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
- Cleanup LZA and associated resources <https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/uninstall-the-solution.html>

## Troubleshooting

### Failure in ImportASEAResourceStage

If the LZA pipeline fails in the ImportASEAResources stage and you need to restart the pipeline from the beginning. You will need to remove a file from the `asea-lza-resource-mapping-<accountId>` bucket. The name of the file is `asearesources.json`. Download a copy of the file and then delete it from the S3 bucket. The file will be recreated when the pipeline is rerun.

### Failure creating new account after upgrade when using Control Tower

Error messages:

- Account creation failed error message in the Prepare stage.
- AWS Control Tower failed to deploy one or more stack set instances: StackSet Id: AWSControlTowerBP-VPC-ACCOUNT-FACTORY-V1

If you are adding a new Control Tower account, ensure that there are no regions where VPCs are automatically created when an account is provisioned. To do this:

- Navigate to the Control Tower Home Page
- Select 'Account Factory' on the left of the page
- Click the 'Edit' button on the 'Network configuration' section
- Ensure that none of the regions are selected under 'Regions for VPC Creation'
