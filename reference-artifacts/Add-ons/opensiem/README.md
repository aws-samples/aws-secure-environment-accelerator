# SIEM on Amazon OpenSearch Service for the ASEA

This AWS Cloud Development Kit ([CDK](https://aws.amazon.com/cdk/)) project integrates the [SIEM on Amazon OpenSearch Service](https://github.com/aws-samples/siem-on-amazon-opensearch-service) with the AWS Secure Environment Accelerator (ASEA). The goal is to make it easier to deploy the *SIEM on Amazon OpenSearch Service* github project into the ASEA default multi-account architecture.

At a highlevel, the deployment steps consist of the following:
- Updating the ASEA config.json
- Running the ASEA State Machine
- Updating the **SiemConfig.json** associated with this project
- Using CDK to deploy two different CloudFormation stacks
- OpenSearch Configuration

The total deployment time takes approximately 30 minutes (+ ASEA State Machine execution time). The AWS resources deployed extend beyond the AWS Free tier; you will incur AWS charges when this solution is deployed.

## Prerequisites

1. Permissions:
    1. Organization Management Account - ability to update ASEA config file and run ASEA state machine
    2. Operations Account - Administrator Access *
    3. Log Archive Account - Administrator Access *

        \* does NOT require the use of a special role which bypasses ASEA SCP's. An AWS SSO based role is preferable.

2. Node > v14.5.0 (install using nvm is recommended)
3. AWS CLI installed
4. git



## Project Build & Deployment

### SiemConfig.json

The **SiemConfig.json** is used to configure how this solution is deployed into the Operations and LogArchive AWS account. Below is the structure of the config file with the token **----- REPLACE -----** highlighting values that require replacement. Below is a table describing the different values in detail.

```
{
    "operationsAccountId": "----- REPLACE -----",
    "logArchiveAccountId": "----- REPLACE -----",
    "vpcId": "----- REPLACE -----",
    "region": "ca-central-1",
    "s3LogBuckets": [
        "asea-logarchive-phase0-aescacentral1------ REPLACE -----",
        "asea-logarchive-phase0-cacentral1------ REPLACE -----"
    ],
    "securityGroups": [
        {
            "name": "OpenSearch-SIEM-SG",
            "inboundRules": [
                {
                    "description": "Allow Traffic Inbound",
                    "tcpPorts": [
                        443
                    ],
                    "source": [
                        "10.0.0.0/8",
                        "100.96.252.0/23",
                        "100.96.250.0/23"
                    ]
                }
            ],
            "outboundRules": [
                {
                    "description": "All Outbound",
                    "type": [
                        "ALL"
                    ],
                    "source": [
                        "0.0.0.0/0"
                    ]
                }
            ]
        }
    ],
    "appSubnets": [
       "subnet------ REPLACE -----",
       "subnet------ REPLACE -----"
    ],
    "lambdaLogProcessingRoleArn": "arn:aws:iam::----- REPLACE -----:role/SIEM-Lambda-Processor",
    "cognitoDomainPrefix": "asea-siem------ REPLACE -----",
    "openSearchDomainName": "siem",
    "openSearchInstanceTypeMainNodes": "c6g.xlarge.search",
    "openSearchInstanceTypeDataNodes": "r6g.xlarge.search",    
    "openSearchCapacityMainNodes": 3,
    "openSearchCapacityDataNodes": 4,
    "openSearchVolumeSize": 100,
    "openSearchConfiguration": "opensearch-config.json",    
    "maxmindLicense": "license.txt"
}
```

| Config      | Description |
| ----------- | ----------- |
| operationsAccountId      | This is the AWS Account ID for the Operations account       |
| logArchiveAccountId   | This is the AWS Account ID for the Log Archive account        |
| vpcId | This is the VPC Id, within the Operations account, where the OpenSearch Domain will be deployed | 
| region | This is the ASEA primary region |
| s3LogBuckets | This is contains a string array of the S3 Bucket names, in the Log Archive account, that will have S3 Notifications configured. In the default ASEA architecture, there are 2 S3 buckets that should be added here. |
| securityGroups | This structure is similar to what is used in the ASEA config file, but with reduced implementation. The security groups here will be applied to the Lambda Functions and OpenSearch domain. The Security Groups will be created by this project. |
| appSubnets | These are the SubnetIds of existing subnets within the VPC. The Lambda Functions and OpenSearch domain will be deployed into the Subnets defined here. |
| lambdaLogProcessingRoleArn | This is the IAM Role that the **Lambda Processor** will use to download S3 Objects from the Log Archive and write documents to OpenSearch. This is a protected role that is referenced by this project, but created by the ASEA. More details below. This value must be an IAM ARN. |
| cognitoDomainPrefix | Amazon Cognito is used to provision user access to the OpenSearch Dashboards. The value specified here will be used as the domain; it must be regionally unique. (You can't use the text aws, amazon, or cognito, in the domain prefix) | 
| openSearchDomainName | This is the name for the OpenSearch domain |
| openSearchInstanceTypeMainNodes | This specifies the OpenSearch instance type for the main nodes. ([Supported Types](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-instance-types.html)) | 
| openSearchInstanceTypeDataNodes | This specifies the OpenSearch instance type for the data nodes. ([Supported Types](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-instance-types.html)) | 
| openSearchCapacityMainNodes | This specifies the number of OpenSearch main nodes to provision. |
| openSearchInstanceTypeDataNodes | This specifies the number of OpenSearch data nodes to provision. | 
| openSearchVolumeSize | This specifies the amount of storage (GB) provisioned for the data nodes. This impacts the amount of available storage for the Domain. Note there are [limits](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/limits.html) for EBS size for instance types. | 
| openSearchConfiguration | This is the file name of the SIEM search configuration. This file should reside in the *config* folder. This json file mirrors the content found in the *SIEM on Amazon OpenSearch Service* corresponding INI file. |
| maxmindLicense | This is the file name of the MaxMind license file. This file should reside in the *config* folder. This is an optional configuration that enables IP to Geo which enables map visualizations. Leave blank ("") to skip the deployment of this functionality. |



---

# Deployment and Configuration

## 1. ASEA Config

The ASEA Config needs to be updated to provision an IAM role that has cross-account access to the Log Archive S3 Buckets. Attempting to do this outside the ASEA config would encounter Service Control Policy (SCP) guardrails and the possibility of changes being reverted on subsequent State Machine executions. The role that will be created will have permissions to OpenSearch, S3, LambdaVPC, and the LogArchive S3 buckets and KMS key. Its trust policy will allow Lambda to assume it; it will be used by the **Lambda Processor**.

* Add the following to the **roles** array within the **operations** account section in the ASEA config file.

```
{
   "role": "SIEM-Lambda-Processor",
   "type": "lambda",
   "ssm-log-archive-read-only-access": true,
   "policies": [
      "AmazonOpenSearchServiceFullAccess",
      "service-role/AWSLambdaVPCAccessExecutionRole",
      "AmazonS3ReadOnlyAccess",
      "SIEM-Custom-Policy"
   ],
   "boundary-policy": "Default-Boundary-Policy"
}
```

* Update the **siem-custom-permission-policy.txt** document. The primary region and operations account id should be replaced.
```
arn:aws:sqs:<region>:<operations account id>:opensearch-siem-dlq
```
* In the root AWS account, locate the ASEA config S3 bucket.
* Create a folder (if it doens't exist) called **iam-policy**
* Upload the **siem-custom-permission-policy.txt** file into the **iam-policy** folder.
* Add the folling to the **policies** array within the **operations** account section in the ASEA config file.
```
{
    "policy-name": "SIEM-Custom-Policy",
    "policy": "siem-custom-permission-policy.txt"
}
```


* Run the ASEA State Machine and wait until completion. 
* Get the ARN for the role after the State Machine completes. (Found in the **operations** account). 
* Change the **lambdaLogProcessingRoleArn** value in the **SiemConfig.json** with the ARN in the previous step.
* 

## 2. SiemConfig.json Updates

Update the **SiemConfig.json**. Replace all sample values with desired values.

* You can add country information as well as latitude/longitude location information to each IP address. To get location information, SIEM on OpenSearch Service downloads and uses GeoLite2 Free by [MaxMind](https://www.maxmind.com/). If you want to add location information, get your free license from MaxMind. If you get a license key, create a file called **license.txt** and place it in the **config** folder. There must be outbound internet connectivity from the VPC in the operations account for this feature to work.

## 3. Deploy the OpenSearch Stack

1. Clone the github repo locally
1. Change directory to **reference-artifacts/Add-ons/opensiem**

--- 

1. Apply AWS credentials for the **operations** AWS account to a command terminal. Set the default region example: 
```
  > export AWS_DEFAULT_REGION=ca-central-1
```
2. Confirm AWS credentials are applied for the working command terminal.  The output should show credentials for the operations AWS account.
```
 > aws sts get-caller-identity
```
3. Install the code library dependencies:
```
 > npm install
```
4. Build the CDK solution and Lambdas

**mac/linux**
```
 > npm run install:packages
 > npm run build
``` 
**windows (command window)**
```
> cd lambdas/common && npm install && npm run build && cd ..\..
> cd lambdas/siem-geoip && npm install && npm run build && cd ..\..
> cd lambdas/siem-config && npm install && npm run build && cd ..\..
```

1. Provision the OpenSearch Service Linked Role
```
 > aws iam create-service-linked-role --aws-service-name es.amazonaws.com
```
6. Deploy the CDK Bootstrap. This will deploy a cdkbootstrap CloudFormation stack.
```
> npx cdk bootstrap --toolkit-stack-name orgcdktoolkit
```
7. Deploy the CDK OpenSearch Stack. This will take approximately 20 minutes.
```
> npx cdk deploy --toolkit-stack-name orgcdktoolkit OpenSearchSiemStack
```
8. Once completed, the CloudFormation stack will output a value for **LambdaProcessorArn**. This value will be needed as input to the second CDK deployment.

## 4. Deploy the S3 Notifications Stack
1. Apply AWS credentials for the **log archive** AWS account to a command terminal. Set the default region example: 
```
  > export AWS_DEFAULT_REGION=ca-central-1
```
2. Confirm AWS credentials are applied for the working command terminal. The output should show credentials for the log archive AWS account.
```
 > aws sts get-caller-identity
```
3. Deploy the CDK Bootstrap. This will deploy a cdkbootstrap CloudFormation stack. Reminder: This is being deployed in the log archive AWS Account.
```
> npx cdk bootstrap --toolkit-stack-name orgcdktoolkit
```
3. Deploy the CDK S3 Notifications Stack. Replace **<OpenSearchSiemStack.LambdaProcessorArn CfnOutput>** with the output value from the first CloudFormation Stack.
```
> npx cdk deploy --toolkit-stack-name orgcdktoolkit  \
--parameters lambdaProcessorArn="<OpenSearchSiemStack.LambdaProcessorArn CfnOutput>" \
OpenSearchSiemS3NotificationsStack 
```

## 5. Configuration
### Cognito
Amazon Cognito is used to add authentication and protection to the OpenSearch Service, and it is configured as part of this automation. To gain access to the OpenSearch Dashboards, a user must be created and configured in the Cognito User Pool.

![cognito](docs/cognito/images/image1.png)

1. Create a user in Cognito


### OpenSearch Dashboard
The OpenSearch Dashboard can only be accessed privately; the end point is not public. Here are a few options on how that is possible:
* Establish a Site to Site VPN or Direct Connect. 
* Deploy a ClientVPN solution
* Deploy a Windows EC2 and use it as a bastion host. (use SSM to securely connect)

After establishing private connectivity, get the **OpenSearch Dashboards URL (VPC)** from the OpenSearch domain. 


![opensearch name](docs/cognito/images/image3.png)

Use this URL to access the OpenSearch Dashboards. You will be redirected to Cognito for authentication. Use the login credentials setup in the previous step. After authenticating, you will redirected to OpenSearch Dashboards.

Upload the preconfigured visualizations. For convenience, **dashboard.ndjson.zip** is provided in this repository, but the latest versions can be found on the [SIEM on Amazon OpenSearch Service](https://github.com/aws-samples/siem-on-amazon-opensearch-service) github project. 

1. When you login for the first time, [Select your tenant] is displayed. Select [Global]. You can use the prepared dashboard etc.
1. You can also select [Private] instead of [Global] in [Select your tenant] and customize configuration and dashboard etc. for each user. The following is the procedure for each user. If you select Global, you do not need to set it.
   1. To import OpenSearch Dashboards' configuration files such as dashboard, download saved_objects.zip. Then unzip the file.
   2.  Navigate to the OpenSearch Dashboards console. Click on "Stack Management" in the left pane, then choose "Saved Objects" --> "Import" --> "Import". Choose dashboard.ndjson which is contained in the unzipped folder. Then log out and log in again so that the imported configurations take effect.

## 6. Cleaning up
The following AWS resources are retained when deleting the stack:
- Cloudwatch Log Groups
- KMS Key and Alias
- CDK Bootstrap stacks (Operations and Log Archive accounts)

1. In the log archive account
   1. navigate to CloudFormation and delete the **OpenSearchSiemS3NotificationsStack** stack
2. In the operations account
   1. navigate to S3, open the S3 bucket prefixed with **opensearchsiemstack-**, and delete all the objects inside
   1. navigate to CloudFormation and delete the **OpenSearchSiemStack** stack   

