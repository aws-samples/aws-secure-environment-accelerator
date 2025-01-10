# Upgrade pre-requisites and configuration

## Prerequisites

- You are running the latest version of ASEA. If you are not running ASEA version 1.5.11 then upgrade ASEA before starting the ASEA to LZA upgrade process
- Confirm all suspended accounts are under a specific OU that is ignored by the accelerator. (see [Suspended accounts](../comparison/feature-specific-considerations.md#suspended-accounts))
- Confirm you don't have any empty OU that don't contain any active AWS Accounts and are not referenced from the ASEA configuration files. The convert-config tool won't generate empty OUs in the configuration. This doesn't apply to the default OUs created from the base ASEA configuration (i.e. Dev, Test, Prod, Central), those can be empty.
- You can run the scripts from your local workstation. If you are filtering egress traffic from your corporate network you need to ensure [outbound connectivity to AWS service endpoints](../troubleshooting.md#network-timeout-or-connectivity-issue-running-the-upgrade-tool).
- You will need Git, AWS CLI, NodeJS and Yarn installed.
- We highly recommend having appropriate AWS Support plans on all AWS Accounts of your landing zone. For any issues encountered during the upgrade process you need to open a support case to get assistance and exchange relevant information with AWS staff. At a minimum Developer support is needed on the management account and core landing zones accounts (Logging, Security, Networking and Perimeter) to troubleshoot any cross-account issues. Business support is the minimum recommended tier if you have production workloads in AWS
- Upgrading your landing zone from ASEA to LZA requires advanced knowledge of configuring and operating ASEA and LZA landing zones. This operation should be led by your most-experienced resources responsible for your current landing zone operations. Review all the documentation in this upgrade guide and Landing Zone Accelerator implementation guide.


### Technical Prerequisites

Before running the upgrade tools, ensure you meet the following requirements:

!!! note "Environment Requirements"
    ✅ **Recommended Environment:** Linux or MacOS with a Bash-like shell
    
    ⚠️ **Important Note:** Windows compatibility is limited as tools have not been extensively tested on this platform


#### Verify npm installation

Node.js uses the npm package manager to help you install tools and frameworks for use in your application. To confirm you have npm installed you can run the following command:

```
npm -v
```

#### Set your node heap size

Set your node heap size to at least 4k

```
export NODE_OPTIONS=--max-old-space-size=4096
```

#### Install Yarn

Utilizing the npm package manager, you can install yarn globally using the following command:

```
npm install -g yarn
```


### Clone The ASEA Repo

In order to prepare the ASEA environment for upgrade you will need to clone the ASEA GitHub repository:
<https://github.com/aws-samples/aws-secure-environment-accelerator.git>

```bash
git clone https://github.com/aws-samples/aws-secure-environment-accelerator.git
```

### Install the upgrade scripts project dependencies and build the project

TODO: Need to update branch name to align with GA branch (v1.6.0 ??)

- Ensure you are still on the `lza-migration` branch and navigate to the directory which contains the upgrade scripts:

  ```bash
  cd aws-secure-environment-accelerator
  git checkout lza-migration
  cd reference-artifacts/Custom-Scripts/Pre-migration
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

!!! info
    By default the upgrade tool uses `ca-central-1` as the home region. If you use a different home region you need to set the AWS_REGION environment variable before running `migration-config`. e.g. `AWS_REGION=eu-west-1 yarn run migration-config`

??? abstract "Detailed information"
    This command will also deploy a CloudFormation template and create two CodeCommit repositories. The CloudFormation template will create an S3 bucket for the resource mapping files. The first CodeCommit repository will also be used for the resource mapping files. The second CodeCommit repository will be used for the Landing Zone Accelerator configuration files that will be created in a later step.

    To skip the creation of these resources and only generate the local configuration file, you can use the `local-update-only` argument.

    ```bash
    yarn run migration-config local-update-only
    ```


### Confirm Outputs

Navigate to `<rootDir>/src/input-config/input-config.json` and confirm the file has been generated with values corresponding to your environment. It is not expected that these values will need to be modified.

Two CodeCommit repositories have been created

- `<prefix-name>-Mappings` to store resource mapping
- `<prefix-name>-LZA-config` to store LZA configuration

??? abstract "Detailed documentation of input-config.json"

    - `aseaPrefix`: The ASEA prefix used for ASEA deployed resources. This can be found in the initial ASEA Installer CloudFormation template `Parameters` under `AcceleratorPrefix`. Ex: `ASEA-`
    - `acceleratorName`: The ASEA accelerator name. This can be found as a parameter in the initial ASEA Installer CloudFormation template.
    - `repositoryName`: The ASEA Repository name used to store ASEA Configuration files. This can be found either in the initial ASEA Installer CloudFormation template `Parameters` under `ConfigRepositoryName` or in the CodeCommit Service.
    - `assumeRoleName`: The name of the role which will be assumed during the upgrade process. Ex: `<prefix-name>-PipelineRole`
    - `parametersTableName`: The name of the DynamoDB Table where ASEA account metadata is stored. This can be found by:
        - Navigating to the DynamoDB service home page
        - Selecting `Tables` from the drop down on the left side of the console.
        - Finding the table name similar to `<prefix-name>-Parameters`.
    - `homeRegion`: Home Region for ASEA. This field can be retrieved from the ASEA Configuration file
    - `mappingBucketName`: Name of the S3 bucket to write the mapping output to. Ex: `asea-lza-resource-mapping-<management-account-id>`
    - `aseaConfigBucketName`: Name of ASEA created phase-0 central bucket, will be used to copy and convert assets for LZA.
    - `operationsAccountId`: Operations Account Id.
    - `installerStackName`: The name of the ASEA installer CloudFormation stack.
    - `centralBucket`: The name of the ASEA Phase 0 configuration bucket. Ex: `asea-management-phase0-configcentral1-ocqiyas45i27`
    - `mappingRepositoryName`: The name of the CodeCommit repository resource mapping repository. Ex. `ASEA-Mappings`. Do not modify this value.
    - `lzaConfigRepositoryName`: The name of the CodeCommit repository that will store the LZA configuration files. Ex. `ASEA-LZA-config`. Do not modify this value.
    - `lzaCodeRepositorySource`: This value will be used when deploying the LZA installer CloudFormation stack. Ex. `github`
    - `lzaCodeRepositoryOwner`: This value will be used when deploying the LZA installer CloudFormation stack. Ex. `awslabs`
    - `lzaCodeRepositoryName`: This value will be used when deploying the LZA installer CloudFormation stack. Ex. `landing-zone-accelerator-on-aws`
    - `lzaCodeRepositoryBranch`: This value will be used when deploying the LZA installer CloudFormation stack. Ex. `asea-lza-migration`
    - `managementAccountEmail`: This value will be used when deploying the LZA installer CloudFormation stack.
    - `logArchiveAccountEmail`: This value will be used when deploying the LZA installer CloudFormation stack.
    - `auditAccountEmail`: This value will be used when deploying the LZA installer CloudFormation stack.
    - `controlTowerEnabled`: This value will be used when deploying the LZA installer CloudFormation stack. Possible values `Yes` or `No`
