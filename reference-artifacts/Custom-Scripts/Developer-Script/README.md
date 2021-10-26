## AWS SEA Developer Script

The script is intended for use by Accelerator developers to automate the generation of files required for LOCAL development.

This script is a work in-progress and was designed for use by our development and test teams. This script grabs the latest outputs from an installed SEA environment from DynamoDB and stores them in the local/offline outputs.json file. ** Use at your own risk **

## Requirements

- This script requires the Accelerator to have completed one full/complete and successful state machine execution. It is NOT designed for use during the initial deployment process.
- This script is written in Typescript, given the entire codebase is Typescript

## Instructions

1. Paste AWS temporary credentials (or set AWS_PROFILE) in the command terminal which will be used to execute the script

2. Set the AWS_REGION. For example, `export AWS_REGION=ca-central-1`

3. Install the packages manually. `npm install`

4. Ensure the necessary environment variables are set. Here are the defaults (change as needed):

```
export ACCELERATOR_NAME="PBMM"
export ACCELERATOR_PREFIX="PBMMAccel-"
export ACCELERATOR_STATE_MACHINE_NAME="PBMMAccel-MainStateMachine_sm"
export BOOTSTRAP_STACK_NAME=PBMMAccel-CDKToolkit
```

4. Execute the script `ts-node src/load-outputs.json`

5. On successful execution, this script generates the file: `accelerator/src/deployments/cdk/outputs.json`

## Use

1. Install the Accelerator (with a full successful SM execution)
2. Execute this script to populate the local outputs.json to enable local mode development
3. Locally execute and test the code/Phase being modified (i.e. Phase1)
4. Manually execute storeoutputs for the phase (i.e. Phase1)
5. Re-run this script to update the local outputs.json file
6. Execute or test other Phases (i.e. Phase2)

Note: Steps 4 and 5 are only required if the executed Phase altered the outputs, if outputs remained identical, this is not required.

