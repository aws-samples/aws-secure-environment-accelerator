## AWS SEA Initial Scripts generation

The script is intended for development to assist in generation of development dependent files.

This script is a work in-progress and was designed for use by our development and test teams. This script will get latest outputs from SEA Installed environment - **use at your own risk**.

## Details

Currently retrieving only outputs from SEA Deployed environment.

## Instructions

1. Paste AWS temporary credentials (or set AWS_PROFILE) into the command terminal that will execute the script and set AWS_DEFAULT_REGION.

2. Execute the script `ts-node src/load-outputs.json`

3. upon successful execution of script it will generate `accelerator/src/deployments/cdk/outputs.json`