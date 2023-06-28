# ASEA to LZA Scripts

## Pre-Requisites
- Install Yarn
    - https://classic.yarnpkg.com/lang/en/docs/install
- Validate Yarn is installed
    ```
    yarn --version
    ```
- Install `ts-node`
    ```
    yarn add ts-node
    ```
- Validate `ts-node` is installed
    ```
    ts-node --version
    ```

### Clone The ASEA to LZA Migration Repo
In order to run the mapping scripts, you will need to clone the ASEA to LZA Migration Repo where the scripts live:
https://github.com/aws-samples/aws-secure-environment-accelerator

    git clone git@github.com:aws-samples/aws-secure-environment-accelerator.git

### Install the project dependencies and build the project
- From the base of the project directory, run the following commands:
    ```
    yarn install
    yarn build
    ```

### Deploy CloudFormation Template
Prior to running the mapping script, a CloudFormation script will need to be deployed. This will deploy an S3 bucket that has:
- Object versioning enabled
- AWS S3 SSE (server side encryption) enabled
- Public access blocked
- Bucket policy to scope down access to specific users
- Bucket policy to require encrpytion while writing objects

The script exists under:
    `src/cloudformation/mapping-output-bucket.yml`

In order to deploy the script, you will need to:
- Navigate to the AWS CloudFormation console
- Select `Create Stack`
- On the `Create Stack` page, select the radio buttons for:
    - `Template is Ready` under `Prepare Template Section`
    - `Upload a Template File` under `Specify Template Section`
    - Select `Choose File` and navigate to the `src/cloudformation/mapping-output-bucket.yml` file.
    - Click `Next`.
- On the `Specify Stack Details` page fill out the fields for:
    - `StackName`
    - `S3BucketName` - This needs to be a unique bucket name in order to be created and will store the mapping output files.
- Make sure to copy the `S3BucketName` field, as it will be used to update the `mappingBucketName` field in the next section.

### CloudFormation Deployment Validation
After deploying the `mapping-output-bucket.yml` template the S3 Bucket Resource created will need to be validated. In order to validate this:
- Navigate to S3 in the AWS Console
- Select the bucket that you created in the previous step
- Click on `Properties`
- Ensure that `Bucket Versioning` is enabled
- Ensure that `Default Encryption` is set to  `Amazon S3 managed keys (SSE-S3)`
- Ensure that Block Public Access is enabled
- Ensure that an S3 Bucket Policy is created and validate the bucket policy
### Update Configuration File
- Navigate to :
`src/input-config/input-config.json`
- Modify the values below:
    - *`aseaPrefix`* - The ASEA prefix used for ASEA deployed resources. This can be found in the initial ASEA Installer CloudFormation template `Parameters` under `AcceleratorPrefix`. Ex: `ASEA`
        - Note: This value should not include the trailing `'-'` character
    - *`repositoryName`* - The ASEA Repository name used to store ASEA Configuration files. This can be found either in the initial ASEA Installer CloudFormation template `Parameters` under `ConfigRepositoryName` or in the CodeCommit Service. 
    - * `assumeRoleName`* - The name of the role which will be assumed during the migration process.
    - *`parametersTableName`* - The name of the DynamoDB Table where ASEA account metadata is stored. This can be found by:
        - Navigating to the DynamoDB service home page
        - Selecting `Tables` from the drop down on the left side of the console.
        - Finding the table name similar to `<prefix-name>-Parameters`.
    - *`homeRegion`* - Home Region for ASEA. This field can be retrieved from the ASEA Configuration file.
    - *`mappingFileName`* - Name of the S3 key to write the mapping output to. Ex: `aseaMapping.json`
    - *`mappingBucketName`* - Name of the S3 bucket to write the mapping output to. Ex: `asea-mapping-outputs`
```
{
  "aseaPrefix": "<ASEA-Prefix>",
  "repositoryName": "<ASEA-Config-Repository-Name>",
  "assumeRoleName": "<ASEA-Role>",
  "parametersTableName": "<ASEA-Parameters-DDB-Table-Name>",
  "homeRegion": "<ASEA-Home-Region>",
  "mappingFileName": "<Output-Mapping-File-Name",
  "mappingBucketName": "<Output-Mapping-Bucket-Name>"
}
```

## Resource Mapping Script and Drift Detection

### Overview/Description of Script
The Resource Mapping script will generate the ASEA mapping file which will be used throughout the ASEA to LZA Migration process. In order to accomplish this task, the script needs to do the following:
- Ensure that the S3 Bucket exists and has proper object versioning enabled
- Retrieve all ASEA Enabled Regions from the ASEA Configuration File.
- Retrieve all ASEA Enabled Accounts from the ASEA Parameters Table.
- Assume a role into each account and create a unique AWS CloudFormation client for each environment (region/account combination). For each unique environment:
    - List every CloudFormation Template associated with ASEA (This is a filtered down list operation)
    - List every Resource that is associated with the CloudFormation Template.
    - Detect Drift on each individual resource
- The outputs of these will be saved in the S3 Bucket.

### Retrieve Temporary IAM Credentials via AWS Identity Center
Prior to running the Migration script, you will need temporary IAM credentials in order to run the script. In order to retrieve these, follow the instructions here and set the temporary credentials in your environment:
https://aws.amazon.com/blogs/security/aws-single-sign-on-now-enables-command-line-interface-access-for-aws-accounts-using-corporate-credentials/

### Commands

```
cd src
ts-node index.ts resource-mapping
```

### Outputs
After running the `resource-mapping` script, the following artifacts should be generated:
- Output Mapping File
- Drift Detection Output (per account/per region/per stack)
- Stack Resource List (per account/per region/per stack)


In order to validate the output artifacts, the following items will need to be verified inside the S3 Bucket (*Output-Mapping-Bucket*):
- Output Mapping File
    - Look for file which matches *Output-Mapping-File-Name* from configuration file.
    - Spot Check that file has correct accounts, regions, and stacks
- Drift Detection Output
For each Account, Region, and Stack:
    - Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-drift-detection.csv`
    - Ensure that the resources listed in the CSV file match up with the CloudFormation drift-detection status of the CloudFormation resources in the stack.
        - IN_SYNC means there is no drift detected
        - NOT_SUPPORTED means that CloudFormation does not support drift-detection on that specific resource.
    - If there is drift detected, this drift needs to be manually fixed. The specific resource and configurations which need to be addressed will be available in the drift-detection.csv file.
Stack Resource List Output
For each Account, Region, and Stack:
    -  Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-resouces.csv`
    - Ensure that the resources listed in the CSV file match up with the deployed CloudFormation resources in the stack.

