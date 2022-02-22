## AWS SEA Uninstall Script

The cleanup script is intended for development to assist in removing resources created by the accelerator. It currently does not support running with the Landing Zone or Control Tower baselines.

This uninstall script is a work in-progress and was designed for use by our development and test teams in **_non-production_** environments. This script is destructive - **use at your own risk**.

## Details

The logic of the script is the following:

1. Downloads the **config.json** from CodeCommit (assumes ASEA as a repository prefix)

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

   i. DELETE Stack -CDKToolkit

   j. DELETE Stack -PipelineRole

   **Note:** If any resources have been deployed (ex: EC2 or an ALB, etc), then a stack will fail to delete. You must manually cleanup the resources and re-run the script.

   **Note:** The S3 centralized logging bucket may contain 100,000's of objects. During the S3 empty bucket, the AWS temporary credentials may expire. Before running this script, empty the bucket externally or change the Lifecycle retention to 1 day and run this after the bucket is emptied.

7. Cleans up the Organization Management Account

   a. DELETES Stack instances from StackSets beginning with "ASEA". When all stack instances deleted, the StackSet is deleted.

   b. DELETES the Organization CloudTrail

   c. DELETES the Service Control Policies with a name starting with "ASEA"

8. Cleans up GuardDuty

   a. For all regions in the Security account, removes disassociations members, removes members, and disables organization admin account

9. Cleans up Macie

   a. For all regions in the Security account, removes disassociations members, removes members, and disables organization admin account

10. Cleans up Cloud Watch Logs. For all Accounts in all supported regions (multi-threaded):

    a. DELETES Log Group beginning with "ASEA-"

## Instructions

~~Paste AWS temporary credentials (or set AWS_PROFILE) into the command terminal that will execute the script and set AWS_DEFAULT_REGION.~~

1. Log into the AWS console as a Full Administrator to the Organization Management account.
2. Start a CloudShell session.
3. Copy the files from this folder and your `config.json` to the CloudShell session;
   - ensure the management account name is properly reflected in the config file, or the script will fail;
   - the script does not handle the use of the {HOME_REGION} variable (at this time), you can run the script with --HomeRegion <region> to replace the home region
4. Create a virtual python environment. `python3 -m venv env`
5. Activate the python environment. `source env/bin/activate`
6. Install the python3 required libaries (ex: `pip install -r requirements.txt`).
7. Make the Python script executable (ex: `chmod +x aws-sea-cleanup.py`).

8. Before running this script you must manually delete AWS SSO.

9. Execute the script `python3 aws-sea-cleanup.py`, a stacks.json should be generated.

**Note: ** if you used a different AcceleratorPrefix you can use `python3 aws-sea-cleanup.py --AcceleratorPrefix YOUR_ACCELERATOR_PREFIX`.

10. Execute the script `python3 aws-sea-cleanup.py`, it should delete/cleanup your environment.

   - if the script fails with an `Explicit Denied` error messages, manually remove all SCP's from all OU's and accounts from within AWS Organizations
   - this requires first disabling the CloudWatch Event Rule, or the policies will auto re-attach

11. Manual steps (in the Organization Management account):
   - In Secrets Manager, set the Secret `accelerator/config/last-successful-commit` to an empty string "";
   - In DynamoDB, delete the 3 `ASEA-*` tables;
   - In Systems Manager Parameter Store, delete the `/accelerator/version` and `/accelerator/first-version` parameters;
   - In CodeCommit, delete the repository `ASEA-Config-Repo`.

## Considerations

1. Additional known resources not currently cleaned up:

   a. Certificates in ACM

   b. The `ASEA-CloudFormationStackSetExecutionRole` stack      

   c. Does not recreate Default VPCs

   d. KMS keys

2. If redeploying the accelerator in AWS Accounts after having ran this script. Note the following:

   a. Re-populate the original S3 config bucket and delete the CodeCommit repository

   b. The Step Function will fail on first re-run when trying to compare configuration files if you forget to set the secret `accelerator/config/last-successful-commit` to an empty string.

   c. GuardDuty and/or Macie will likely fail during a Phase deployment. If that happens, access the Security account and invite all accounts as members in all regions. Some accounts may be listed as non-members.

   d. If you accidentally delete a cdk bucket (`cdktoolkit-stagingbucket-*`) in any region, you MUST remove the corresponding CDK bootstrap stack (`CDKToolkit`) from the corresponding regions before deploying.

3. It has also been reported that the Firewall Manager organization admin account is not unset

## Requirements

- boto3
- tabulate
