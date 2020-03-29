# PBMM Accelerator

## Installation

Configure the AWS CLI so that CDK can deploy in the AWS account.

    export AWS_PROFILE=aws-account-profile
    export AWS_REGION=ca-central-1

Install the `pnpm` dependencies.

    pnpm install

Enter the main project directory and bootstrap the CDK. You only need to execute this step once.

    cd accelerator/cdk
    pnpm run bootstrap

Next we need to enable versioning on the the S3 bucket that the CDK bootstrap command has created. You only need to
execute this step once.

Store a configuration file as a secret in secrets manager with name `accelerator/config`. You can find an example in
`config.example.json`.

Finally deploy the CDK project.

    cd accelerator/cdk
    pnpm run deploy

## Architecture

The main component of this project is a CodePipeline that creates CloudFormation stacks in specific accounts. These 
accounts could be the master account, log archive account, security account, and so on.

The CloudFormation stacks are based on templates that are generated using the CDK and are location in
`initial-setup/templates` and `account-setup/templates`. These CDK templates are converted to CloudFormation files in a
CodeBuild step in the CodePipeline.

## Code Structure

The main entry point for CDK is `accelerator/cdk/index.ts`. Is constructs the CodePipelines for the initial setup and
for the account setup. The CodePipelines for initial setup and account setup are defined in

- `initial-setup/cdk` and
- `account-setup/cdk`.

Some actions in the CodePipeline require Lambda functions. The code for the Lambda functions is located in
`initial-setup/lambdas/src/steps`.

### Create a Stack Using the CodePipeline

Add the CDK code for the stack you want to create under `initial-setup/templates/src`. Make sure the new CDK code is
called from the main entry point `initial-setup/templates/src/index.ts`.

You can read the *Testing* section in the `README.md` file in `initial-setup` to test synthesizing the CDK code to
CloudFormation templates.

Finally, add an action in the CodePipeline that is defined in `initial-setup/cdk/src/index.ts`. The step should look
something like the following.

    new CreateStackAction({
        // The name of the action in the CodePipline
        actionName: 'Deploy_SharedNetwork',
        // The role to assume in case the stack needs to be created in a sub account
        assumeRole: accountExecutionRoles.sharedNetwork,
        // The name of the stack that will be created
        stackName: `${props.acceleratorPrefix}SharedNetwork`,
        // The name of the stack in the template you created under `initial-setup/templates`
        stackTemplateArtifact: templatesSynthOutput.atPath('SharedNetwork.template.json'),
        // This is the role to run the step function Lambda functions as
        // You can leave this value
        lambdaRole: pipelineRole,
        // This is the code for the step function Lambda functions
        // You can leave this value
        lambdas: props.lambdas,
        // The amount of time to wait every time before checking if the stack is created
        waitSeconds: 10,
    })
