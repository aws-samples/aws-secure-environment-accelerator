# PBMM Initial Setup Templates

## Description

This directory contains CDK code to generate CloudFormation templates that will later be used to create stacks in the
master or subaccounts.

## Testing

Configure the AWS CLI so that CDK can deploy in the AWS account.

    export AWS_PROFILE=aws-account-profile
    export AWS_REGION=ca-central-1

Store the configuration file as a secret in secrets manager under name `accelerator/config`. Make sure the AWS profile
you configured above has access to the secret.

Run the following command to synthesize CloudFormation files.

    export ACCELERATOR_NAME="Accelerator"
    export ACCELERATOR_PREFIX="PBMMAccel-"
    export ACCELERATOR_SECRET_NAME="accelerator/config"
    pnpm run synth

If everything goes well, the folder `cdk.out` should contain `*.template.json` files that contain the CloudFormation
output from the stacks you defined in CDK.
