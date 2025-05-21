
# Installing the Landing Zone Accelerator

!!! warning
    Once LZA is installed and the LZA pipeline has run, rollback to ASEA won't be possible anymore. Make sure you are ready to proceed and that you executed all the recommended preparation steps.

## Installing the LZA Pipeline

You are ready to deploy AWS Landing Zone Accelerator. This step will deploy a CloudFormation template, creates two AWS CodePipeline pipelines, an installer and the core deployment pipeline along with associated dependencies. This solution uses AWS CodeBuild to build and deploy a series of CDK-based CloudFormation stacks that are responsible for deploying supported resources in the multi-account, multi-Region environment. The CloudFormation template will first create the `${prefix-name}-Installer`, which in turn will create the accelerator pipeline, `${prefix-name}-Pipeline`

- For more details on the deployment pipelines, take a look here:
  <https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deployment-pipelines.html>

### Installing the LZA Pipeline Commands

```bash
cd <root-dir>
yarn run lza-prep
```

## Installing the LZA Pipeline Confirmation

Navigate to the AWS CloudFormation console and confirm that the stack named `AWSAccelerator-InstallerStack` deployed successfully.

## Run the LZA Pipeline

- For general LZA Pipeline deployment details, refer to the LZA Implementation Guide here: <https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html>
- During the Landing Zone Accelerator pipeline deployment, there are two ASEA upgrade specific stages `ImportAseaResources` and `PostImportAseaResources`. These two stages allow the LZA to manage and interact with resources that were originally managed in the scope of ASEA. The current ASEA Resource Handlers exist in the table here: [ASEA Resource Handlers](../asea-resource-handlers.md).
    - **ImportAseaResources**: This stage uses the `CFNInclude` module to include the original ASEA Managed CloudFormation resources. This allows the resources to be managed in the context of the LZA CDK Application. SSM Parameters are created for these resources so that they can be interacted with during the LZA Pipeline run.
    - **PostImportAseaResources**: This stage runs at the end of the LZA Pipeline, it allows the LZA pipeline to modify original ASEA Managed Cloudformation resources. This requires a separate stage because it allows the prior LZA stages to interact with ASEA resources and then modifies all ASEA resources (as opposed to CFN Including the ASEA resources in every stage).
