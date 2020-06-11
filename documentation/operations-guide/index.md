# Operations & Troubleshooting Guide

## System Overview

### Accelerator Installer

The installer stack contains the necessary resources to deploy the Accelerator in the AWS account.

It consists of the following resources:

- `PBMMAccel-InstallerPipeline`: this is a `AWS::CodePipeline::Pipeline` that pulls the latest Accelerator code from
  GitHub. It launches the CodeBuild project `PBMMAccel-InstallerProject_pl` and launches the Accelerator state machine.
- `PBMMAccel-InstallerProject_pl`: this is a `AWS::CodeBuild::Project` that installs the Accelerator in AWS account.
- `PBMMAccel-Installer-StartExecution`: this is a `AWS::Lambda::Function` that launches the Accelerator after
  CodeBuild deploys the Accelerator.

![Installer Diagram](./diagrams/installer.png)

The `PBMMAccel-InstallerPipeline` starts when first installed using the CloudFormation template. The pipeline also runs
after every GitHub update for the configured branch. The administrator can also start the pipeline manually by clicking
the `Release Change` button in the AWS Console.

![CodePipeline Release Change](./images/codepipeline-release-change.png)

After pulling the source from GitHub the pipeline needs manual approval from the administrator to continue deploying
the Accelerator in the AWS account.

![CodePipeline Manual Approval](./images/codepipeline-approval.png)

![CodePipeline Manual Approval Popup](./images/codepipeline-approval-popup.png)

After the administrator approves the change, the `PBMMAccel-InstallerProject_pl` CodeBuild project starts. The CodeBuild
project uses the GitHub source artifact. The CodeBuild projects spins up a new Linux instances and installs the
Accelerator dependencies and starts the deployment of the Accelerator using the AWS Cloud Development Kit (CDK<sup>[1](#cdk)</sup>).

CDK bootstraps its environment and creates the `CDKToolkit` stack in the AWS account. It creates the S3 bucket `cdktoolkit-stagingbucket-*`
and the ECR repository `aws-cdk/assets`.

CDK deploys assets to the bootstrap bucket and bootstrap repository that are used by the Accelerator. The assets that are
store on S3 include default IAM policies, default SCPs, default firewall configuration. The assets that are pushed to ECR
include the Accelerator Docker build image.

### Accelerator

### Phases

## Troubleshooting




<a name="cdk">[1]</a>: https://docs.aws.amazon.com/cdk/latest/guide/home.html
