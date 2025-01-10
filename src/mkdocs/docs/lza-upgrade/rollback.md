# ASEA to LZA Upgrade Rollback Strategy

## Rollback Strategy Overview

The existing ASEA to LZA upgrade process relies on a combination of automated and manual mechanisms to accomplish the upgrade. This is due to AWS service limits as well as resource collisions of resources which exist in both the ASEA and LZA solutions.

If an issue occurs during the upgrade process, there needs to be a rollback plan in place. Since the upgrade process utilizes both automated and manual steps, we will roll back in an automated fashion where possible and require manual steps for others. The high-level rollback steps are below.

!!! warning
    Carefully review the current documentation to understand when rolling back is applicable. The rollback steps are intended as a last resort mechanism and cannot be applied once the LZA pipeline as run. Make sure you complete all the validation steps proposed before starting the upgrade procedures in your production environment.


## Rollback Steps

The rollback steps are designed to re-install ASEA, those are only needed if you uninstalled ASEA bu running the `asea-prep` command. The steps are only possible if you didn't start the LZA installation by running the `lza-prep` command.

- Confirm that the `${Prefix}-CDK-Toolkit` stacks have been deleted in all regions and accounts where the accelerator is deployed
- In the management account, empty and delete the CDK assets bucket (`cdk-hnb659fds-assets-<account>-ca-central-1`). This bucket is part of the `${Prefix}-CDK-Toolkit` stack and has a retention policy to retain, therefore it needs to be deleted manually
- Review, backup and delete the ASEA DynamoDB Tables
    - In the management account, backup the content of the following DynamoDB tables: `ASEA-cidr-pool`, `ASEA-cidr-subnet-assign`, `ASEA-cidr-vpc-assign`, `ASEA-Output-Utils`, `ASEA-Outputs`, `ASEA-Parameters`
    - If using dynamic IP allocation, the `ASEA-cidr-*` tables contain important data that you need to keep
    - The content of the `ASEA-Output-Utils`, `ASEA-Outputs`, `ASEA-Parameters` will be regenerated in the ASEA install
    - After backing up their content, delete the DynamoDB Tables, they will be re-created in ASEA install
- Run ASEA Installer Stack
    - Download the Installer Stack from: <https://github.com/aws-samples/aws-secure-environment-accelerator/releases>
    - Navigate to the CloudFormation homepage
    - Click on the “Create Stack” button
    - Choose the option “Upload a template file” and click on the “Choose file” button.
    - Navigate to the Installer Stack template on your local machine, select the file, and click “Next”
    - On the “Specify Stack details” page, provide a stack name for your deployment.
    - Fill in the CloudFormation Parameters.
    - Complete CloudFormation deployment.
- Run the ASEA-InstallerPipeline
    - After deploying the CloudFormation template, a new CodePipeline pipeline will be created. This Pipeline will be called `{$Prefix}-InstallerPipeline`. - The Code Pipeline will automatically trigger an execution and begin running when created
    - This pipeline runs a CodeBuild job which does a number of things – most importantly, create the ASEA State Machine.
    - **IMPORTANT** If using dynamic IP allocation, you need to repopulate the data in the `ASEA-cidr-*` DDB tables that you backed up in an earlier step before running the ASEA State Machine. The state machine will be automatically triggered at the end of the ASEA `{$Prefix}-InstallerPipeline`, stop the pipeline execution when it reaches the `Execute` stage or stop the ASEA State Machine execution as soon as it starts.
    - Run the ASEA State Machine
    - After the InstallerPipeline has successfully run, the ASEA State Machine will be kicked off which will ensure that ASEA features are rolled back to match the ASEA configuration.