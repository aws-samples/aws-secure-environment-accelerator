## AWS SEA Uninstall Script

The cleanup script is intended for development to assist in removing resources created by the accelerator. It currently does not support running with the Landing Zone or Control Tower baselines.

This uninstall script is a work in-progress and was designed for use by our development and test teams in **_non-production_** environments. This script is destructive - **use at your own risk**.

## Details

The logic of the script is the following:

1. Downloads the **config.json** from CodeCommit (assumes PBMM as a repository prefix)

2. Checks for **stacks.json** in the executing directory.

   a. If **stacks.json** does not exist, it will scan all AWS Accounts and document all CloudFormation stacks that are deployed. It will then create the **stacks.json** file. This is used in subsequent runs to determine deployed stacks/regions/accounts. The script will finish and will need to run a subsequent time.

3. (**stacks.json** exists)

4. Cleans up Route53 Resolver Rules

5. Cleans up Directory Sharing

6. For all Accounts in all supported regions (multi-threaded):

   all: if the stack has deployed a S3 bucket, it will be emptied first.

   a. DELETE Stack -Phase5 then,

   b. DELETE Stack -Phase4 then,

   c. DELETE Stack -Phase3 then,

   d. DELETE Stack -Phase2 then,

   e. DELETE Stack -Phase1 then,

   f. DELETE Stack -Phase0 then,

   g. DELETE Stack -Phase-1 then,

   h. DELETE Stack -InitialSetup

   **Note:** If any resources have been deployed (ex: EC2 or an ALB, etc), then a stack will fail to delete. You must manually cleanup the resources and re-run the script.

   **Note:** The S3 centralized logging bucket may contain 100,000's of objects. During the S3 empty bucket, the AWS temporary credentials may expire. Before running this script, empty the bucket externally or change the Lifecycle retention to 1 day and run this after the bucket is emptied.

7. Cleans up the Master Account

   a. DELETES Stack instances from StackSets beginning with "PBMMAccel". When all stack instances deleted, the StackSet is deleted.

   b. DELETES the Organization CloudTrail

   c. DELETES the Service Control Policies with a name starting with "PBMMAccel"

8. Cleans up GuardDuty

   a. For all regions in the Security account, removes disassociations members, removes members, and disables organization admin account

9. Cleans up Macie

   a. For all regions in the Security account, removes disassociations members, removes members, and disables organization admin account

10. Cleans up Cloud Watch Logs. For all Accounts in all supported regions (multi-threaded):

    a. DELETES Log Group beginning with "PBMMAccel-"

## Instructions

1. Paste AWS temporary credentials (or set AWS_PROFILE) into the command terminal that will execute the script and set AWS_DEFAULT_REGION.

2. Install the python3 required libaries (ex: `pip3 install -r requirements.txt`)

3. Before running this script you must manually delete AWS SSO.

4. Execute the script `python3 aws-sea-cleanup.py`
5. In Secrets Manager set the Secret `accelerator/config/last-successful-commit` to an empty string.

## Considerations

1. Not all resources are currently cleaned up. Here is a list of what is known:

   a. Certificates in ACM

   b. The initial bootstrap CloudFormation Stack

   c. CDK S3 buckets

   d. Secret Keys

   e. Does not recreate Default VPCs

2. If redeploying the accelerator in AWS Accounts after having ran this script. Note the following:

   a. Re-populate the original S3 config bucket and delete the CodeCommit repository

   b. The Step Function will fail on first re-run when trying to compare configuration files if you forget to set the secret `accelerator/config/last-successful-commit` to an empty string.

   c. GuardDuty and/or Macie will likely fail during a Phase deployment. If that happens, access the Security account and invite all accounts as members in all regions. Some accounts may be listed as non-members.

## Requirements

- boto3
- tabulate
