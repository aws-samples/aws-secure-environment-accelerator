# ASEA to LZA Upgrade Preparation (Preview)

> DISCLAIMER: This Preview release is intended for select customers that are working closely with their AWS Account teams to plan and execute the upgrade.  If you have not engaged direclty with your AWS Account team to plan an ASEA to LZA upgrade, it's not recommended to run this upgrade preparation yet, unless it's in an environment that is for sandbox and experimentation only and that could be rebuilt from scratch if required.  Your AWS Account team can guide you through this prepartion step and answer questions about what it does, please reach out to them if you are interested in running these read-only prepration steps, even if you are not fully ready to run a full ASEA to LZA upgrade. 

The steps described in this file are a subset of the full ASEA to LZA upgrade steps. These steps don't modify your environment and can be run as part of your upgrade preparation to help identify features or configurations that require extra planning or considerations.

## Prerequisites

### Required tools
You will need Git, the AWS CLI, NodeJS and Yarn installed.

### Clone The ASEA Repo

You will need to clone the ASEA GitHub repository:
<https://github.com/aws-samples/aws-secure-environment-accelerator.git>

```bash
git clone https://github.com/aws-samples/aws-secure-environment-accelerator.git
```

### Install the project dependencies and build the project

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

## Inventory script

The inventory script is part of the ASEA to LZA upgrade tools. It parses your ASEA configuration file and extract key information about your configuration to help prepare your upgrade and identify potential elements that are not automatically supported by the upgrade process. The tool only needs access to your ASEA raw configuration file and doesn't need access to the AWS accounts. It outputs data about the high-level configuration of OU, accounts and VPC, including the name of these elements. Review the content of the file to make sure it doesn't contain information you consider sensitive before sharing its content.

### Obtain a local copy of ASEA raw configuration file

The inventory script runs on the raw version of the ASEA config file that is transformed by the state machine. This file is stored in the `ASEA-Config-Repo` CodeCommit repository under `raw/config.json`. Locate the file and download it to a local folder on your workstation.

### Run the tool
```
cd <root-dir>
yarn run inventory <path-to-raw-config.json>
```

When the tools completes it generates a `asea-inventory.json` under the folder `outputs/inventory`. Review the content of the file to make sure it doesn't contain information you consider sensitive before sharing its content. Any warnings part of the output help you identify parts of your configuration that require careful planning.


## Generate the LZA configuration files

The `convert-config` script allows you to generate the LZA configuration files based on your current ASEA deployment. The LZA configuration validation tool can be used to confirm that the generated configuration is valid and doesn't contain any errors.

### Retrieve Temporary IAM Credentials via AWS Identity Center

Prior to running the pre-upgrade scripts, you will need temporary IAM credentials in order to run the script in your management account. In order to retrieve these, follow the instructions here and set the temporary credentials in your environment:
<https://aws.amazon.com/blogs/security/aws-single-sign-on-now-enables-command-line-interface-access-for-aws-accounts-using-corporate-credentials/>

### Create Upgrade Tool Configuration File and Prepare Environment

Creates the configuration file used by the upgrade tool. The configuration file will be created in the directory `<root-dir>/src/input-config/input-config.json`.

```bash
cd <root-dir>
yarn run migration-config local-update-only
```

> **⚠️ Warning**: Make sure to specify the `local-update-only` argument, otherwise the script will deploy resources (S3 bucket, CodeCommit repositories) in your management account to prepare for the upgrade. These resources are not needed now.

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
yarn run convert-config local-update-only
```

### Configuration validation
To validate the configuration files you will need to download and build the [Landing Zone Accelerator code](https://github.com/awslabs/landing-zone-accelerator-on-aws).

Instructions to run the configuration validation can be found in the [LZA Developer guide](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#configuration-validator)

The path to your configuration file is based on what you generated in the previous step:  `<root-dir>outputs\lza-config`

## Additional documentation
We strongly encourage you to review the [Feature specific considerations](README.md#feature-specific-considerations) and [Key differences between ASEA and LZA](README.md#other-key-differences-between-asea-and-lza) sections of the upgrade guide to identify any other particularities that should be taken into consideration for your upgrade planning.