# Advanced Troubleshooting - Removing ASEA managed resources

Generally, once the LZA update is completed, all landing zone resources can be managed via the LZA configuration file, regardless of whether the resources were initially deployed by ASEA or LZA.

However, there are some resource exceptions that are not fully supported by LZA, particularly resources related to VPCs and networking. Refer to the [ASEA Resource Handlers documentation](./asea-resource-handlers.md) to understand the support status for various resource types. New resources may be supported in newer versions of LZA.

!!! note 
    We **do not** recommend manually deleting resources that were created in ASEA CloudFormation stacks. This will cause drift on the stacks an may prevent the LZA pipeline of successfully executing. You should follow the process outline in this document to make sure resources are properly removed from ASEA CloudFormation stacks.


## How to Remove Resources Not Supported by LZA

!!! danger "Important"
    This documentation involves manual modifications of ASEA resource mapping files and advanced manipulation on CloudFormation stacks. We strongly recommend testing these operations in a non-production environment first.

In cases where unsupported resources need to be removed, here's the procedure to follow.

### 1 - Remove the Resource from the LZA Configuration File

Remove or comment out the resource in the LZA configuration file. Check if other sections of the configuration file reference the resource, and if so, remove the reference. Execute the LZA pipeline.

It's important to first modify the configuration file and run the LZA pipeline to:

1) Confirm that LZA doesn't proceed directly with deletion.  
2) Ensure there are no other dependent resources in the configuration that should also be deleted.  
3) Ensure the resource won't be re-created by LZA after deletion.  

#### 1.1 - Identify the resources that need to be deleted

After the LZA pipeline completes, identify which resources still need to be deleted. Locate in which ASEA CloudFormation stacks the resources exist and note their Logical ID.

### 2 - Manually Mark the Resource for Deletion

LZA maintains a mapping file with an inventory of resources deployed by ASEA and managed in ASEA CloudFormation stacks. Each stack has a resource inventory file with their status (`isDeleted: true/false`).

It's possible to manually modify the `isDeleted` property to force resource deletion during the next LZA pipeline execution in the **ImportAseaResources** step.

You need valid credentials to your management account to accomplish the following steps. AWS CLI commands are provided as a reference, the same steps can be executed with the AWS Console.

#### 2.1 - Download Mapping Files for the Account owning the resources to be deleted

!!! note
    All `aws` commands must be executed with a profile having access to the landing zone management account.

a) Create a local directory to store mappings.
```bash
mkdir resource-mapping
```

b) Identify the S3 bucket containing mapping files in the management account. Set an environment variable for future reference. For example:

```bash
export LZA_MAPPING_BUCKET=asea-lza-resource-mapping-111222333444
```

c) Identify in which account, region, and CloudFormation stack the resources to be removed are present. Define variables that will be referenced in upcoming commands.

```bash
ACCOUNT=444555666777
REGION=ca-central-1
```

d) Download resources and stacks files locally for the account in question.

```bash
aws s3 sync s3://$LZA_MAPPING_BUCKET/resources/$ACCOUNT/$REGION/ ./resource-mapping/resources/$ACCOUNT/$REGION/
aws s3 sync s3://$LZA_MAPPING_BUCKET/stacks/$ACCOUNT/$REGION/ ./resource-mapping/stacks/$ACCOUNT/$REGION/
```

#### 2.2 - Identify Resources to Remove

a) In the `resources` directory, open the file corresponding to the stack containing the resource to modify. You can search by logicalId, physicalId, or CloudFormation resource type.

b) Add an `"isDeleted": true,` property in the JSON object corresponding to the resource to modify.

c) Identify if other dependent resources reference this resource and add the `isDelete` property to them as well. If needed, you can consult the equivalent CloudFormation stack template in the `stacks` subdirectory to identify dependencies. (Note: do not directly modify the stack template)

!!! note "Dependencies"
    Always verify if you also intend to delete dependencies. For example several resources have SSM Parameters that references the ID of the resource, it is safe to remove the SSM Parameter related to a resource when removing that resource. However, there are cases where resource B reference the resource A that you want to remove, but you want to keep resource B. Refer to the section [Modifying ASEA resources](#how-to-modify-resources-not-supported-by-lza) in this document to handle these cases.

#### 2.3 - Update Mapping Files on S3

Modified resource files must be updated to S3. These are versioned, so it's not necessary to keep a copy of the file; previous versions can be retrieved from S3 if needed.

```bash
aws s3 sync ./resource-mapping/resources/$ACCOUNT/$REGION/ s3://$LZA_MAPPING_BUCKET/resources/$ACCOUNT/$REGION/ --sse AES256
```

### 3 - Release the LZA Pipeline

Release the LZA pipeline. Resources marked for deletion will be removed from ASEA stacks in the **ImportASEAResources** phase.

#### (Optional Alternative) - Generate the Stack Locally

You can also use the instructions in the [LZA Developer Guide](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/) section to perform a local synth of ASEA stacks and validate your changes in the CloudFormation stack before executing the pipeline.

```bash
yarn run ts-node --transpile-only cdk.ts synth --stage import-asea-resources --require-approval any-change --config-dir $LZA_CONFIG_DIR --partition aws --region $REGION --account $ACCOUNT
```

> This command must be executed from the LZA directory.

!!! note
    For local synth, don't forget to copy the changes to the resource file to S3 before running the command, the CDK project references the files on S3 and not your local version.

!!! note "Tip"
    You can also use a tool like [cfn-lint](https://github.com/aws-cloudformation/cfn-lint) to validate that the CloudFormation template is valid. (the `i W` option ignores warnings to show only errors)
    ```bash
    cfn-lint cdk.out/phase1-444555666777-ca-central-1/ASEA-SharedNetwork-Phase1.template.json -i W
    ```

## How to Modify Resources Not Supported by LZA

Some changes may require modifying an ASEA resource configuration without completely removing it. For example, when removing a Spoke VPC, it may be necessary to remove TGW sharing with the account to be suspended, but the sharing resource (type `AWS::RAM::ResourceShare`) cannot be completely removed; its configuration needs to be modified to remove sharing targets.

The procedure for this type of change is similar to that for removing resources.

### 1 - Prerequisites

We assume that steps 1. and 2.1. from the resource removal section above have already been completed, that configurations have been removed from the LZA configuration file and you have locally synchronized the necessary stack and resource files.

### 2 - Modifying the ASEA Stack File

a) In the `stacks` directory, open the file corresponding to the stack containing the resource to modify. You can search by logicalId, physicalId, or CloudFormation resource type.

b) Make the necessary modification in the CloudFormation template. For example, to remove a target account in the share:

```diff
"TgwMainSharing51786237": {
   "Type": "AWS::RAM::ResourceShare",
   "Properties": {
    "Name": "Main",
    "Principals": [
-     "111111111111",
     "999888777666"
    ],
    "ResourceArns": [
     {
      "Fn::Join": [
       "",
       [
        "arn:aws:ec2:",
        {
         "Ref": "AWS::Region"
        },
        ":",
        {
         "Ref": "AWS::AccountId"
        },
        ":transit-gateway/",
        {
         "Ref": "TgwMain627BB489"
        }
       ]
      ]
     }
    ]
   }
  },
```

c) (Optional) Validate that the modified stack file is valid and compliant with a tool such as [cfn-lint](https://github.com/aws-cloudformation/cfn-lint).

### 3 - Deploy the modified stack

Using the CloudFormation console, deploy the modified stack template by locating the existing stack, choose Update stack and Replace the existing template with your updated local version.

### 4 - Update Stack Files on S3

The locally modified stack files must be updated to S3. These are versioned, so it's not necessary to keep a copy of the file; previous versions can be retrieved from S3 if needed.

```
aws s3 sync ./resource-mapping/stacks/$ACCOUNT/$REGION/ s3://$LZA_MAPPING_BUCKET/stacks/$ACCOUNT/$REGION/ --sse AES256
```

### 5 - Release the LZA Pipeline

Release the LZA pipeline.
