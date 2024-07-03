# ASEA to LZA Upgrade Inventory Script (Alpha)

The inventory script is part of the ASEA to LZA upgrade tools. It parses your ASEA configuration file and extract key information about your configuration to help prepare your upgrade and identify potential elements that are not automatically supported by the upgrade process. The tool only needs acess to your ASEA raw configuration file and doesn't need access to the AWS accounts. It outputs data about the high-level configuration of OU, accounts and VPC, including the name of these elements. Review the content of the file to make sure it doesn't contain information you consider senstive before sharing its content.

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

## Running the inventory script

### Obtain a local copy of ASEA raw configuration file

The inventory script runs on the raw version of the ASEA config file that is transformed by the state machine. This file is stored in the `ASEA-Config-Repo` CodeCommit repository under `raw/config.json`. Locate the file and download it to a local folder on your workstation.

### Run the tool 
```
cd <root-dir>
yarn run inventory <path-to-raw-config.json>
```

When the tools completes it generates a `asea-inventory.json` under the folder `outputs/inventory`. Review the content of the file to make sure it doesn't contain information you consider senstive before sharing its content.