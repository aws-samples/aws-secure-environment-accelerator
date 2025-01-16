# Disable and uninstall ASEA

## Disable ASEA Custom Resource Delete Behaviors

To complete the upgrade process, we will need to disable ASEA Custom Resource deletions. In order to do this, we have added a new parameter called `LZAMigrationEnabled`. Setting this to true during CloudFormation stack update will enable this behavior. In order disable the resources, complete the following:

### Deploy the upgrade ASEA Installer Stack

You will need to update the existing CloudFormation Installer stack:

- Download the AcceleratorInstaller stack from the latest [ASEA Release](https://github.com/aws-samples/aws-secure-environment-accelerator/releases) on GitHub (i.e. v1.6.0 or later)
- Navigate to the AWS CloudFormation console
- Select the existing installer stack then **Update Stack**
- On the **Update Stack** page, select the radio button for:
    - **Replace current template** under **Prepare Template Section**`
    - Click **Next**
    - **Upload a Template File** under **Specify Template Section**
    - Select **Choose File** and navigate to the file downloaded from GitHub release page
    - Click **Next**
- On the **Specify Stack Details** in the Parameters section update only the parameter named `LZAMigrationEnabled`. Change the value to `true`.
    - Update the parameter named `RepositoryBranch`. Change the value to the latest ASEA release (e.g. `release/v1.6.0`)
    - Click **Next**
- On the **Configure Stack Options** don't make any changes.
    - Click **Next**
- On the **Review**
    - In **Capabilities** section, select the box **I acknowledge the AWS CloudFormation might create IAM resources with custom names.**
    - Click **Next**
- Wait for the stack to finish updating

## Execute the ASEA installer pipeline and state machine

- Navigate to AWS CodePipeline console
- Locate the ASEA-InstallerPipeline under the Pipeline/Pipelines section
- Select the pipeline and then click on **Release change**
- Wait for the pipeline execution to complete
- The last step of the pipeline will start the ASEA main state machine
- Monitor the progress of the main state machine
- Navigate to the AWS Step Function console
- The `ASEA-MainStateMachine_sm` should be running
- Wait until the `ASEA-MainStateMachine_sm` is finished before moving to the next section

## Re-run resource mapping script

When the `ASEA-MainStateMachine_sm` has completed successfully, re-run the [resource mapping script](../preparation//resource-mapping-drift-detection.md).

```bash
cd <root-dir>
yarn run resource-mapping
```

## Prepare ASEA Environment

### Prepare ASEA Environment Overview

This step will prepare the ASEA environment for upgrade to the Landing Zone Accelerator on AWS. In this step the upgrade scripts tool will delete the CDK Toolkit CloudFormation stacks in the Management account. Which includes deleting ECR images from the CDK Toolkit ECR repository. Deleting the ASEA CloudFormation installer stack and finally the ASEA InitialSetup stack. You will also be emptying the ASEA artifacts bucket in order for the installer CloudFormation stack to be deleted.
In order to empty the artifacts S3 bucket you will need to navigate to S3 console.

- Find the bucket that has the string `artifactsbucket` in the name
- Click the radio button next to the bucket
- Click the **Empty** button in the upper right
- Type the string **permanently delete** in the confirmation text box
- Click the **Empty** button
- Wait until a green bar appears with the text **Successfully emptied bucket**
- Switch back to your CLI environment and run the commands below

### Prepare ASEA Environment Commands

```bash
cd <root-dir>
yarn run asea-prep
```

Wait until the commands complete.