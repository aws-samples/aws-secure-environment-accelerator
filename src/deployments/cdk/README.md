# PBMM Initial Setup Templates

## Description

This directory contains CDK code that is used to deploy stacks in the subaccounts.

## Local Development

Create a `config.json` file that is based on the `config.example.json` file in the `initial-setup/templates` directory.
Make sure to adjust the `config.json` file so that the email address and names of the accounts are valid.

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

Create an `outputs.json` file that contains the outputs from the different phases. You can get this output from the
secrets manager as well after running the state machine. It should look something like the following.

    [
        {
            "accountKey": "shared-network",
            "outputKey": "CentralVpcOutput6FD59021",
            "outputValue": "{\"type\":\"VpcOutput\",\"value\":{\"vpcId\":\"vpc-042d9bbf06cf701e3\",\"vpcName\":\"Central\",\"subnets\":[{\"subnetId\":\"subnet-0f00e0435fdbe99dd\",\"subnetName\":\"TGW\",\"az\":\"a\"},{\"subnetId\":\"subnet-0ed2be03caac1d18c\",\"subnetName\":\"TGW\",\"az\":\"b\"},{\"subnetId\":\"subnet-0dc897e12131c8688\",\"subnetName\":\"Web\",\"az\":\"a\"},{\"subnetId\":\"subnet-07f5795ff5b6d4364\",\"subnetName\":\"Web\",\"az\":\"b\"},{\"subnetId\":\"subnet-0da2f121fb4bb3866\",\"subnetName\":\"App\",\"az\":\"a\"},{\"subnetId\":\"subnet-0728346c9747a6be1\",\"subnetName\":\"App\",\"az\":\"b\"},{\"subnetId\":\"subnet-0539b77df68386959\",\"subnetName\":\"Data\",\"az\":\"a\"},{\"subnetId\":\"subnet-0339e0fb436dabfc8\",\"subnetName\":\"Data\",\"az\":\"b\"},{\"subnetId\":\"subnet-05fe5de5de41e6b54\",\"subnetName\":\"Mgmt\",\"az\":\"a\"},{\"subnetId\":\"subnet-01fee06f6cf9409e7\",\"subnetName\":\"Mgmt\",\"az\":\"b\"},{\"subnetId\":\"subnet-069f1db9605991d27\",\"subnetName\":\"GCWide\",\"az\":\"a\"},{\"subnetId\":\"subnet-06a23fed48e159ae7\",\"subnetName\":\"GCWide\",\"az\":\"b\"}],\"routeTables\":{}}}"
        },
        {
            "accountKey": "shared-network",
            "outputKey": "CentralSharingOutputSharedResourcesAddTagsToResourcesOutput5AB5F081",
            "outputValue": "{\"type\":\"AddTagsToResources\",\"value\":[{\"resourceId\":\"subnet-069f1db9605991d27\",\"resourceType\":\"subnet\",\"sourceAccountId\":\"007307298200\",\"targetAccountIds\":[\"278816265654\"],\"tags\":[{\"key\":\"Accelerator\",\"value\":\"PBMM\"},{\"key\":\"Name\",\"value\":\"SubnetGcWideA_net\"}]},{\"resourceId\":\"subnet-06a23fed48e159ae7\",\"resourceType\":\"subnet\",\"sourceAccountId\":\"007307298200\",\"targetAccountIds\":[\"278816265654\"],\"tags\":[{\"key\":\"Accelerator\",\"value\":\"PBMM\"},{\"key\":\"Name\",\"value\":\"SubnetGcWideB_net\"}]}]}"
        },
        {
            "accountKey": "log-archive",
            "outputKey": "LogArchiveAccountId",
            "outputValue": "272091715658"
        },
        {
            "accountKey": "log-archive",
            "outputKey": "LogArchiveBucketArn",
            "outputValue": "arn:aws:s3:::pbmmaccel-272091715658-ca-central-1"
        },
        {
            "accountKey": "log-archive",
            "outputKey": "LogArchiveEncryptionKey",
            "outputValue": "arn:aws:kms:ca-central-1:272091715658:key/3a44c082-e1a4-4cb0-91d4-b0364beb8887"
        }
    ]

Create a `context.json` file that contains the environment variables that are passed to CDK deploy by the CodeBuild
project. You can find the `cfnDnsEndpointIpsLambdaArn` by deploying the Accelerator CDK project first. The file should
look something like this.

    {
        "acceleratorName": "PBMM",
        "acceleratorPrefix": "PBMMAccel-",
        "acceleratorExecutionRoleName": "AcceleratorPipelineRole",
        "cfnDnsEndpointIpsLambdaArn": "arn:aws:lambda:ca-central-1:687384172140:function:PBMMAccel-InitialSetup-PipelineDnsEndpointIpPoller-R89LHX7APRJU"
    }

Create a `limits.json` file that contains the AWS limits for all the resources defined in CDK. you can find this value
from secrets manager in your master account.

    [
        {
            "accountKey": "shared-network",
            "limitKey": "Amazon VPC/VPCs per Region",
            "serviceCode": "vpc",
            "quotaCode": "L-F678F1CE",
            "value": 5
        },
        {
            "accountKey": "shared-network",
            "limitKey": "Amazon VPC/Interface VPC endpoints per VPC",
            "serviceCode": "vpc",
            "quotaCode": "L-29B6F2EB",
            "value": 50
        },
        {
            "accountKey": "shared-network",
            "limitKey": "AWS CloudFormation/Stack count",
            "serviceCode": "cloudformation",
            "quotaCode": "L-0485CB21",
            "value": 200
        },
        {
            "accountKey": "shared-network",
            "limitKey": "AWS CloudFormation/Stack sets per administrator account",
            "serviceCode": "cloudformation",
            "quotaCode": "L-31709F13",
            "value": 100
        },
    ]

Now that we have created all the files, we can start testing the deployment.

Run the following command to synthesize the CloudFormation template from CDK.

    ./cdk-synth.sh <your-aws-profile>

Run the following command to bootstrap the CDK in all the subaccounts.

    ./cdk-bootstrap.sh <your-aws-profile>

Run the following command to deploy the CDK in all the subaccounts.

    ./cdk-deploy.sh <your-aws-profile>
