# PBMM Initial Setup Templates

## Description

This directory contains CDK code that is used to deploy stacks in the subaccounts.

## Local Development

Create a `config.json` file that is based on the `config.example.json` file in the root of the project. Make sure to
adjust the `config.json` file so that the email address and names of the accounts are valid.

Create an `accounts.json` file that contains the accounts and their IDs. It should look something like the following.

    [
        {
            "key": "master",
            "id": "687384172140"
        },
        {
            "key": "perimeter",
            "id": "258931004286"
        },
        {
            "key": "shared-network",
            "id": "007307298200"
        },
        {
            "key": "operations",
            "id": "278816265654"
        }
    ]

The `key` should be the same as the key of the `mandatory-account-configs` accounts.

Now that we have created both `config.json` and `accounts.json` we can start testing the deployment.

Run the following command to synthesize the CloudFormation template from CDK.

    ./cdk-synth.sh <your-aws-profile>

Run the following command to bootstrap the CDK in all the subaccounts.

    ./cdk-bootstrap.sh <your-aws-profile>

Run the following command to deploy the CDK in all the subaccounts.

    ./cdk-deploy.sh <your-aws-profile>
