# 1. Development Guide

This document is a reference document. Instead of reading through it in linear order, you can use it to look up specific issues as needed.

It is important to read the [Operations Guide](../operations/index.md) before reading this document. If you're interested in actively contributing to the project, you should also review the [Governance and Contributing Guide](https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/CONTRIBUTING.md).

## 1.1. Overview

There are different types of projects in this monorepo.

1. Projects containing CDK code that compiles to CloudFormation templates and deploy to AWS using the CDK toolkit;
2. Projects containing runtime code that is used by the CDK code to deploy Lambda functions;
3. Projects containing reusable code; both for use by the CDK code and/or runtime code.

The CDK code either deploys Accelerator-management resources or Accelerator-managed resources. See the [Operations Guide](../operations/index.md) for the distinction between Accelerator-management and Accelerator-managed resources.

The only language used in the project is TypeScript and exceptionally JavaScript. We do not write CloudFormation templates, only CDK code.

When we want to enable functionality in a managed account we try to

1. use native CloudFormation/CDK resource to enable the functionality;
2. create a custom resource to enable the functionality; or
3. lastly create a new step in the `Initial Setup` state machine to enable the functionality.

## 1.2. Project Structure

The folder structure of the project is as follows:

-   `src/installer/cdk`: See [Installer Stack](#13-installer-stack);
-   `src/core/cdk`: See [Initial Setup Stack](#14-initial-setup-stack);
-   `src/core/runtime` See [Initial Setup Stack](#14-initial-setup-stack) and [Phase Steps and Phase Stacks](#15-phase-steps-and-phase-stacks);
-   `src/deployments/runtime` See [Phase Steps and Phase Stacks](#15-phase-steps-and-phase-stacks);
-   `src/deployments/cdk`: See [Phase Steps and Phase Stacks](#15-phase-steps-and-phase-stacks);
-   `src/lib/accelerator-cdk`: See [Libraries & Tools](#17-libraries-and-tools);
-   `src/lib/cdk-constructs`: See [Libraries & Tools](#17-libraries-and-tools);
-   `src/lib/cdk-plugin-assume-role`: See [CDK Assume Role Plugin](#171-cdk-assume-role-plugin).
-   `src/lib/common-config`: See [Libraries & Tools](#17-libraries-and-tools);
-   `src/lib/common-outputs`: See [Libraries & Tools](#17-libraries-and-tools);
-   `src/lib/common-types`: See [Libraries & Tools](#17-libraries-and-tools);
-   `src/lib/common`: See [Libraries & Tools](#17-libraries-and-tools);
-   `src/lib/custom-resources/**/cdk`: See [Custom Resources](#176-custom-resources);
-   `src/lib/custom-resources/**/runtime`: See [Custom Resources](#176-custom-resources);

## 1.3. Installer Stack

Read the [Operations Guide](../operations/system-overview.md#12-installer-stack) first before reading this section. This section is a technical addition to the section in the Operations Guide.

As stated in the Operations Guide, the `Installer` stack is responsible for installing the `Initial Setup` stack. It is an Accelerator-management resource. The main resource in the `Installer` stack is the `ASEA-Installer` CodePipeline. The CodePipeline uses this GitHub repository as source action and runs CDK in a CodeBuild step to deploy the `Initial Setup` stack.

```typescript
new codebuild.PipelineProject(stack, 'InstallerProject', {
    buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
            install: {
                'runtime-versions': {
                    nodejs: 18,
                },
                commands: ['npm install --global pnpm@8.9.0', 'pnpm install --frozen-lockfile'],
            },
            pre_build: {
                commands: ['pnpm recursive run build'],
            },
            build: {
                commands: [
                    'cd src/core/cdk',
                    // Bootstrap the environment for use by CDK
                    'pnpx cdk bootstrap --require-approval never',
                    // Deploy the Initial Setup stack
                    'pnpx cdk deploy --require-approval never',
                ],
            },
        },
    }),
});
```

When the CodePipeline finishes deploying the `Initial Setup` stack, it starts a Lambda function that starts the execution of the `Initial Setup` stack's main state machine.

The `Initial Setup` stack deployment receives environment variables from the CodePipeline's CodeBuild step. The most notable environment variables are:

-   `ACCELERATOR_STATE_MACHINE_NAME`: The `Initial Setup` will use this name for the main state machine. So it is the `Installer` stack that decides the name of the main state machine. This way we can confidently start the main state machine of the `Initial Setup` stack from the CodePipeline;
-   `ENABLE_PREBUILT_PROJECT`: See [Prebuilt Docker Image](#141-codebuild-and-prebuilt-docker-image).

## 1.4. Initial Setup Stack

Read [Operations Guide](../operations/system-overview.md#13-initial-setup-stack) first before reading this section. This section is a technical addition to the section in the Operations Guide.

As stated in the Operations Guide, the `Initial Setup` stack consists of a state machine, named `ASEA-MainStateMachine_sm`, which executes steps to create the Accelerator-managed stacks and resources in the managed accounts. It is an Accelerator-management resource.

The `Initial Setup` stack is defined in the `src/core/cdk` folder.

The `Initial Setup` stack is similar to the `Installer` stack, as in that it runs a CodeBuild project to deploy others stacks using CDK. In case of the `Initial Setup` stack

-   we use a AWS Step Functions State Machine to run steps instead of using a CodePipeline;
-   we deploy multiple stacks, called `Phase` stacks, in Accelerator-managed accounts. These `Phase` stacks contain Accelerator-managed resources.

In order to install these `Phase` stacks in Accelerator-managed accounts, we need access to those accounts. We create a stack set in the Organization Management (root) account that has instances in all Accelerator-managed accounts. This stack set contains what we call the `PipelineRole`.

The code for the steps in the state machine is in `src/core/runtime`. All the steps are in different files but are compiled into a single file. We used to compile all the steps separately but we would hit a limit in the amount of parameters in the generated CloudFormation template. Each step would have its own CDK asset that would introduce three new parameters. We quickly reached the limit of 60 parameters in a CloudFormation template and decided to compile the steps into a single file and use it across all different Lambda functions.

### 1.4.1. CodeBuild and Prebuilt Docker Image

The CodeBuild project that deploys the different `Phase` stacks is constructed using the `CdkDeployProject` or `PrebuiltCdkDeployProject` based on the value of the environment variable `ENABLE_PREBUILT_PROJECT`.

The first, `CdkDeployProject` constructs a CodeBuild project that copies this whole Github repository as a ZIP file to S3 using [CDK S3 assets](https://docs.aws.amazon.com/cdk/api/latest/docs/aws-s3-assets-readme.html). This ZIP file is then used as source for the CodeBuild project. When the CodeBuild project executes, it runs `pnpm recursive install` which in turn will run all `prepare` scripts in all `package.json` files in the project -- as described in section [CDK Code Dependency on Lambda Function Code](./best-practices.md#134-cdk-code-dependency-on-lambda-function-code).

After installing the dependencies, the CodeBuild project deploys the `Phase` stacks.

```bash
cd src/deployments/cdk
sh codebuild-deploy.sh
```

We have more than 50 workspace projects in the monorepo with a `prepare` script, so the `pnpm recursive install` step can take some time. Also, the CodeBuild project will run for each deployed `Phase` stack in each Accelerator-managed account.

This is where the `PrebuiltCdkDeployProject` CodeBuild project comes in. The `PrebuiltCdkDeployProject` contains a Docker image that contains the whole project in the `/app` directory and has all the dependencies already installed.

```Dockerfile
FROM node:12-alpine3.11
# Install the package manager
RUN npm install --global pnpm
RUN mkdir /app
WORKDIR /app
# Copy over the project root to the /app directory
ADD . /app/
# Install the dependencies
RUN pnpm install --frozen-lockfile
# Build all Lambda function runtime code
RUN pnpm recursive run build --unsafe-perm
```

When this CodeBuild project executes, it uses the Docker image as base -- the dependencies are already installed -- and runs the same commands as the `CdkDeployProject` to deploy the `Phase` stacks.

### 1.4.2. Passing Data to Phase Steps and Phase Stacks

Some steps in the state machine write data to Amazon DynamoDB. This data is necessary to deploy the `Phase` stacks later on. At one time this data was written to Secrets Manager and/or S3, these mechanisms were deemed ineffective due to object size limitations or consistency challenges and were all eventually migrated to DynamoDB.

-   `Load Accounts` step: This step finds the Accelerator-managed accounts in AWS Organizations and stores the account key -- the key of the account in `mandatory-account-configs` or `workload-account-configs` object in the Accelerator config -- and account ID and other useful information in the `ASEA-Parameters` table, `accounts/#` key and `accounts-items-count` key;
-   `Load Organizations` step: More or less the same as the `Load Accounts` step but for organizational units in AWS Organizations and stores the values in the `ASEA-Parameters` table, `organizations` key;
-   `Load Limits` step: This step requests limit increases for Accelerator-managed accounts and stores the current limits in the the `ASEA-Parameters` table, `limits` key.
-   `Store Phase X Output`: This step loads stack outputs from all existing `Phase` stacks and stores the outputs in the DynamoDB table `ASEA-Outputs`.

Other data is passed through environment variables:

-   `ACCELERATOR_NAME`: The name of the Accelerator;
-   `ACCELERATOR_PREFIX`: The prefix for all named Accelerator-managed resources;
-   `ACCELERATOR_EXECUTION_ROLE_NAME`: The name of the execution role in the Accelerator-managed accounts. This is the `PipelineRole` we created using stack sets.

## 1.5. Phase Steps and Phase Stacks

Read [Operations Guide](../operations/system-overview.md#13-initial-setup-stack) first before reading this section. This section is a technical addition to the _Deploy Phase X_ sections in the Operations Guide.

The `Phase` stacks contain the Accelerator-managed resources. The reason the deployment of Accelerator-managed resources is split into different phases is because there cannot be cross account/region references between CloudFormation stacks. See [Cross-Account/Region References](./best-practices.md#121-cross-accountregion-references).

The `Phase` stacks are deployed by a CodeBuild project in the `Initial Setup` stack as stated in the previous paragraphs. The CodeBuild project executes the `codebuild-deploy.sh` script. See [`initial-setup.ts`](https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/src/core/cdk/src/initial-setup.ts#L132).

The [`codebuild-deploy.sh`](https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/src/deployments/cdk/codebuild-deploy.sh) script executes the `cdk.ts` file.

The [`cdk.ts`](https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/src/deployments/cdk/cdk.ts) file is meant as a replacement for the `cdk` CLI command. To deploy a phase stack you would **not** run `pnpx cdk deploy` but `cdk.sh --phase 1`. See [CDK API](#172-cdk-api) for more information why we use the CDK API instead of using the CDK CLI.

The `cdk.ts` command parses command line arguments and creates all the `cdk.App` for all accounts and regions for the given `--phase`. When you pass the `--region` or `--account-key` command, all the `cdk.App` for all accounts and regions will still be created, except that only the `cdk.App`s matching the parameters will be deployed. This behavior could be optimized in the future. See [Stacks with Same Name in Different Regions](#181-stacks-with-same-name-in-different-regions) for more information why we're creating multiple `cdk.App`s.

## 1.6. Store outputs to SSM Parameter Store

Customers need the CloudFormation outputs of resources that are created by the accelerator in order to deploy their own resources in AWS. eg. vpcId in shared-network account to create an ec2 instance, etc.

This step loads the stack outputs from our DynamoDB Table `ASEA-Outputs` and stores as key value pairs in SSM Parameter Store in each account.

Example values are

-   /ASEA/network/vpc/1/name => Endpoint
-   /ASEA/network/vpc/1/id => vpc-XXXXXXXXXX

`ASEA-Outputs-Utils` DynamoDB Table is used extensively to maintain same index irrespective of configuration changes.

This allows customers to reliably build Infrastructure as Code (IaC) which depends on accelerator deployed objects like VPC's, security groups, subnets, ELB's, KMS keys, IAM users and policies. Rather than making the parameters dependent on object names, we used an indexing scheme, which we maintain and don't update as a customers configuration changes. We have attempted to keep the index values consistent across accounts (based on the config file), such that when code is propoted through the SDLC cycle from Dev to Test to Prod, the input parameters to the IaC scripts do not need to be updated, the App subnet, for example, will have the same index value in all accounts.

### 1.6.1. Phases and Deployments

The `cdk.ts` file calls the `deploy` method in the `apps/app.ts`. This `deploy` method loads the Accelerator configuration, accounts, organizations from DynamoDB; loads the stack outputs from Amazon DynamoDB; and loads required environment variables.

```typescript
/**
 * Input to the `deploy` method of a phase.
 */
export interface PhaseInput {
    // The config.json file
    acceleratorConfig: AcceleratorConfig;
    // Auxiliary class to construct stacks
    accountStacks: AccountStacks;
    // The list of accounts, their key in the configuration file and their ID
    accounts: Account[];
    // The parsed environment variables
    context: Context;
    // The list of stack outputs from previous phases
    outputs: StackOutput[];
    // Auxiliary class to manage limits
    limiter: Limiter;
}
```

It is important to note that no configuration is hard-coded. The CloudFormation templates are generated by CDK and the CDK constructs are created according to the configuration file. Changes to the configuration will change the CDK construct tree and that will result in a different CloudFormation template that is deployed.

The different phases are defined in `apps/phase-x.ts`. Historically we created all CDK constructs in the `phase-x.ts` files. After a while the `phase-x.ts` files started to get too big and we moved to separating the logic into separate deployments. Every logical component has a separate folder in the `deployments` folder. Every `deployment` consists of so-called steps. Separate steps are put in loaded in phases.

For example, take the `deployments/defaults` deployment. The deployment consists of two steps, i.e. `step-1.ts` and `step-2.ts`. `deployments/defaults/step-1.ts` is created in `apps/phase-0.ts` and `deployments/defaults/step-2.ts` is created in `apps/phase-1.ts`. You can find more details about what happens in each phase in the [Operations Guide](../operations/index.md).

`apps/phase-0.ts`

```typescript
export async function deploy({ acceleratorConfig, accountStacks, accounts, context }: PhaseInput) {
  // Create defaults, e.g. S3 buckets, EBS encryption keys
  const defaultsResult = await defaults.step1({
    acceleratorPrefix: context.acceleratorPrefix,
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });
```

`apps/phase-1.ts`

```typescript
export async function deploy({ acceleratorConfig, accountStacks, accounts, outputs }: PhaseInput) {
    // Find the central bucket in the outputs
    const centralBucket = CentralBucketOutput.getBucket({
        accountStacks,
        config: acceleratorConfig,
        outputs,
    });

    // Find the log bucket in the outputs
    const logBucket = LogBucketOutput.getBucket({
        accountStacks,
        config: acceleratorConfig,
        outputs,
    });

    // Find the account buckets in the outputs
    const accountBuckets = await defaults.step2({
        accounts,
        accountStacks,
        centralLogBucket: logBucket,
        config: acceleratorConfig,
    });
}
```

### 1.6.2. Passing Outputs between Phases

The CodeBuild step that is responsible for deploying a `Phase` stack runs in the Organization Management (root) account. We wrote a CDK plugin that allows the CDK deploy step to assume a role in the Accelerator-managed account and create the CloudFormation `Phase` stack in the managed account. See [CDK Assume Role Plugin](#171-cdk-assume-role-plugin).

After a `Phase-X` is deployed in all Accelerator-managed accounts, a step in the `Initial Setup` state machine collects all the `Phase-X` stack outputs in all Accelerator-managed accounts and regions and stores theses outputs in DynamoDB.

Then the next `Phase-X+1` deploys using the outputs from the previous `Phase-X` stacks.

See [Creating Stack Outputs](#175-creating-stack-outputs) for helper constructs to create outputs.

### 1.6.3. Decoupling Configuration from Constructs

At the start of the project we created constructs that had tight coupling to the Accelerator config structure. The properties to instantiate a construct would sometimes have a reference to an Accelerator-specific interface. An example of this is the `Vpc` construct in `src/deployments/cdk/common/vpc.ts`.

Later on in the project we started decoupling the Accelerator config from the construct properties. Good examples are in `src/lib/cdk-constructs/`.

Decoupling the configuration from the constructs improves reusability and robustness of the codebase.

## 1.7. Libraries and Tools

### 1.7.1. CDK Assume Role Plugin

At the time of writing, CDK does not support cross-account deployments of stacks. It is possible however to write a CDK plugin and implement your own credential loader for cross-account deployment.

We wrote a CDK plugin that can assume a role into another account. In our case, the Organization Management (root) account will assume the `PipelineRole` in an Accelerator-managed account to deploy stacks.

### 1.7.2. CDK API

We use the internal CDK API to deploy the `Phase` stacks instead of the CDK CLI for the following reasons:

-   It allows us to deploy multiple stacks in parallel;
-   Disable stack termination before destroying a stack;
-   Delete a stack after it initially failed to create;
-   Deploy multiple apps at the same time -- see [Stacks with Same Name in Different Regions](#181-stacks-with-same-name-in-different-regions).

The helper class `CdkToolkit` in `toolkit.ts` wraps around the CDK API.

The risk of using the CDK API directly is that the CDK API can change at any time. There is no stable API yet. When upgrading the CDK version, the `CdkToolkit` wrapper might need to be adapted.

### 1.7.3. AWS SDK Wrappers

You can find `aws-sdk` wrappers in the `src/lib/common/src/aws` folder. Most of the classes and functions just wrap around `aws-sdk` classes and implement promises and exponential backoff to retryable errors. Other classes, like `Organizations` have additional functionality such as listing all the organizational units in an organization in the function `listOrganizationalUnits`.

Please use the `aws-sdk` wrappers throughout the project or write an additional wrapper when necessary.

### 1.7.4. Configuration File Parsing

The configuration file is defined and validated using the [`io-ts`](https://github.com/gcanti/io-ts) library. See `src/lib/common-config/src/index.ts`. In case any changes need to be made to the configuration file parsing, this is the place to be.

We wrap a class around the `AcceleratorConfig` type that contains additional helper functions. You can add your own additional helper functions.

#### 1.7.4.1. `AcceleratorNameTagger`

`AcceleratorNameTagger` is a [CDK aspect](https://docs.aws.amazon.com/cdk/latest/guide/aspects.html) that sets the name tag on specific resources based on the construct ID of the resource.

The following example illustrates its purpose.

```typescript
const stack = new cdk.Stack();
new ec2.CfnVpc(stack, 'SharedNetwork', {});
Aspects.of(stack).add(new AcceleratorNameTagger());
```

The example above synthesizes to the following CloudFormation template.

```yaml
Resources:
    SharedNetworkAB7JKF7:
        Properties:
            Tags:
                - Key: Name
                  Value: SharedNetwork_vpc
```

#### 1.7.4.2. `AcceleratorStack`

`AcceleratorStack` is a class that extends `cdk.Stack` and adds the `Accelerator` tag to all resources in the stack. It also applies the aspect `AcceleratorNameTagger`.

It is also used by the `accelerator-name-generator.ts` functions to find the name of the `Accelerator`.

#### 1.7.4.3. Name Generator

The `accelerator-name-generator.ts` file contains methods that create names for resources that are optionally prefixed with the Accelerator name, and optionally suffixed with a hash based on the path of the resource, the account ID and region of the stack.

The functions should be used to create pseudo-random names for IAM roles, KMS keys, key pairs and log groups.

#### 1.7.4.4. `AccountStacks`

`AccountStacks` is a class that manages the creation of an `AcceleratorStack` based on a given account key and region. If an account with the given account key cannot be found in the accounts object -- which is loaded by `apps/app.ts` then no stack will be created. This class is used extensively throughout the phases and deployment steps.

```typescript
export async function step1(props: CertificatesStep1Props) {
    const { accountStacks, centralBucket: centralBucket, config } = props;

    for (const { accountKey, certificates } of config.getCertificateConfigs()) {
        if (certificates.length === 0) {
            continue;
        }

        const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
        if (!accountStack) {
            console.warn(`Cannot find account stack ${accountKey}`);
            continue;
        }

        for (const certificate of certificates) {
            createCertificate({
                centralBucket,
                certificate,
                scope: accountStack,
            });
        }
    }
}
```

#### 1.7.4.5. `Vpc` and `ImportedVpc`

`Vpc` is an interface in the `src/lib/cdk-constructs/src/vpc/vpc.ts` file that attempts to define an interface for a VPC. The goal of the interface is to be implemented by a `Construct` that implements the interface. This CDK issue provides more background [https://github.com/aws/aws-cdk/issues/5927].

Another goal of the interface is to provide an interface on top of imported VPC outputs. This is what the `ImportedVpc` class implements. The class loads outputs from VPC in a previous phase and implements the `Vpc` interface on top of those outputs.

#### 1.7.4.6. `Limiter`

So far we haven't talked about limits yet. There is a step in the `Initial Setup` state machine that requests limit increases according to the desired limits in the configuration file. The step saves the current limits to the `limits` key in the DynamoDB table `ASEA-Parameters`. The `apps/app.ts` file loads the limits and passes them as an input to the phase deployment.

The `Limiter` class helps keeps track of resource we create and prevents exceeding these limits.

```typescript
for (const { ouKey, accountKey, vpcConfig, deployments } of acceleratorConfig.getVpcConfigs()) {
    if (!limiter.create(accountKey, Limit.VpcPerRegion, region)) {
        console.log(`Skipping VPC "${vpcConfig.name}" deployment.`);
        console.log(`Reached maximum VPCs per region for account "${accountKey}" and region "${region}"`);
        continue;
    }

    createVpc({ ouKey, accountKey, vpcConfig });
}
```

> _Action Item:_ This functionality could be redesigned to scan all the constructs in a `cdk.App` and remove resource that are exceeding any limits.

### 1.7.5. Creating Stack Outputs

Initially we would create stack outputs like this:

```typescript
new cdk.CfnOutput(stack, 'BucketOutput', {
    value: bucket.bucketArn,
});
```

But then we'd get a lot of outputs in a stack. We started some outputs together using JSON. This allowed us to store structured data inside the stack outputs.

```typescript
new JsonOutputValue(stack, 'Output', {
    type: 'FirewallInstanceOutput',
    value: {
        instanceId: instance.instanceId,
        name: firewallConfig.name,
        az,
    },
});
```

Using the solution above, we'd not have type checking when reading or writing outputs. That's what the class `StructuredOutputValue` has a solution for. It uses the `io-ts` library to serialize and deserialize structured types.

```typescript
export const FirewallInstanceOutput = t.interface(
    {
        id: t.string,
        name: t.string,
        az: t.string,
    },
    'FirewallInstanceOutput',
);

export type FirewallInstanceOutput = t.TypeOf<typeof FirewallInstanceOutput>;

new StructuredOutputValue<FirewallInstanceOutput>(stack, 'Output', {
    type: FirewallInstanceOutput,
    value: {
        instanceId: instance.instanceId,
        name: firewallConfig.name,
        az,
    },
});
```

And we can even improve on this a bit more.

```typescript
export const CfnFirewallInstanceOutput = createCfnStructuredOutput(FirewallInstanceOutput);

new CfnFirewallInstanceOutput(stack, 'Output', {
    vpcId: vpc.ref,
    vpcName: vpcConfig.name,
});
```

```typescript
export const FirewallInstanceOutputFinder = createStructuredOutputFinder(FirewallInstanceOutput, () => ({}));

// Create an OutputFinder
const firewallInstances = FirewallInstanceOutputFinder.findAll({
    outputs,
    accountKey,
});

// Example usage of the OutputFinder
const firewallInstance = firewallInstances.find(i => i.name === target.name && i.az === target.az);
```

Generally you would place the output type definition inside `src/lib/common-outputs` along with the output finder. Then in the deployment folder in `src/deployments/cdk/deployments` you would create an `output.ts` file where you would define the CDK output type with `createCfnStructuredOutput`. You would not define the CDK output type in `src/lib/common-outputs` since that project is also used by runtime code that does not need to know about CDK and CloudFormation.

#### 1.7.5.1. Adding Tags to Shared Resources in Destination Account

There is another special type of output, `AddTagsToResourcesOutput`. It can be used to attach tags to resources that are shared into another account.

```typescript
new AddTagsToResourcesOutput(this, 'OutputSharedResourcesSubnets', {
    dependencies: sharedSubnets.map(o => o.subnet),
    produceResources: () =>
        sharedSubnets.map(o => ({
            resourceId: o.subnet.ref,
            resourceType: 'subnet',
            sourceAccountId: o.sourceAccountId,
            targetAccountIds: o.targetAccountIds,
            tags: o.subnet.tags.renderTags(),
        })),
});
```

This will add the outputs to the stack in the account that is initiating the resource share.

Next, the state machine step `Add Tags to Shared Resources` looks for all those outputs. The step will assume the `PipelineRole` in the `targetAccountIds` and attach the given tags to the shared resource.

### 1.7.6. Custom Resources

There are different ways to create a custom resource using CDK. See the [Custom Resource](./best-practices.md#135-custom-resource) section for more information.

All custom resources have a `README.md` that demonstrates their usage.

#### 1.7.6.1. Externalizing `aws-sdk`

Some custom resources set the `aws-sdk` as external dependency and some do not.

Example of setting `aws-sdk` as external dependency.

`src/lib/custom-resources/cdk-kms-grant/runtime/package.json`

```json
{
    "externals": ["aws-lambda", "aws-sdk"],
    "dependencies": {
        "aws-lambda": "1.0.6",
        "aws-sdk": "2.631.0"
    }
}
```

Example of setting `aws-sdk` as embedded dependency.

`src/lib/custom-resources/cdk-guardduty-enable-admin/runtime/package.json`

```json
{
    "externals": ["aws-lambda"],
    "dependencies": {
        "aws-lambda": "1.0.6",
        "aws-sdk": "2.711.0"
    }
}
```

Setting the `aws-sdk` library as external is sometimes necessary when a newer `aws-sdk` version is necessary for the Lambda runtime code. At the time of writing the NodeJS 12 runtime uses `aws-sdk` version `2.631.0`

For example the method `AWS.GuardDuty.enableOrganizationAdminAccount` was only introduced in `aws-sdk` version `2.660`. That means that Webpack has to embed the `aws-sdk` version specified in `package.json` into the compiled JavaScript file. This can be achieved by removing `aws-sdk` from the `external` array.

`src/lib/custom-resources/cdk-kms-grant/runtime/package.json`

#### 1.7.6.2. cfn-response

This library helps you send a custom resource response to CloudFormation.

`src/lib/custom-resources/cdk-kms-grant/runtime/src/index.ts`

```typescript
export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
    console.log(`Creating KMS grant...`);
    console.log(JSON.stringify(event, null, 2));

    // eslint-disable-next-line default-case
    switch (event.RequestType) {
        case 'Create':
            return onCreate(event);
        case 'Update':
            return onUpdate(event);
        case 'Delete':
            return onDelete(event);
    }
}
```

#### 1.7.6.3. cfn-tags

This library helps you send attaching tags to resource created in a custom resource.

#### 1.7.6.4. webpack-base

This library defines the base Webpack template to compile custom resource runtime code.

`src/lib/custom-resources/cdk-kms-grant/runtime/package.json`

```json
{
    "name": "@aws-accelerator/custom-resource-kms-grant-runtime",
    "version": "0.0.1",
    "private": true,
    "scripts": {
        "prepare": "webpack-cli --config webpack.config.ts"
    },
    "source": "src/index.ts",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "externals": ["aws-lambda", "aws-sdk"],
    "devDependencies": {
        "@aws-accelerator/custom-resource-runtime-webpack-base": "workspace:^0.0.1",
        "@types/aws-lambda": "8.10.46",
        "@types/node": "14.14.31",
        "ts-loader": "7.0.5",
        "typescript": "3.8.3",
        "webpack": "4.42.1",
        "webpack-cli": "3.3.11"
    },
    "dependencies": {
        "@aws-accelerator/custom-resource-runtime-cfn-response": "workspace:^0.0.1",
        "aws-lambda": "1.0.6",
        "aws-sdk": "2.668.0"
    }
}
```

`src/lib/custom-resources/cdk-ec2-image-finder/runtime/webpack.config.ts`

```typescript
import { webpackConfigurationForPackage } from '@aws-accelerator/custom-resource-runtime-webpack-base';
import pkg from './package.json';

export default webpackConfigurationForPackage(pkg);
```

## 1.8. Workarounds

### 1.8.1. Stacks with Same Name in Different Regions

The reason we're creating a `cdk.App` per account and per region and per phase is because stack names across environments might overlap, and at the time of writing, the CDK CLI does not handle stacks with the same name well. For example, when there is a stack `Phase1` in `us-east-1` and another stack `Phase1` in `ca-central-1`, the stacks will both be synthesized by CDK to the `cdk.out/Phase1.template.json` file and one stack will overwrite another's output. Using multiple `cdk.App`s overcomes this issues as a different `outdir` can be set on each `cdk.App`. These `cdk.App`s are managed by the `AccountStacks` abstraction.

## 1.9. Local Development

### 1.9.1. Local Installer Stack

Use CDK to synthesize the CloudFormation template.

```sh
cd src/installer/cdk
pnpx cdk synth
```

The installer template file is now in `cdk.out/AcceleratorInstaller.template.json`. This file can be used to install the installer stack.

You can also deploy the installer stack directly from the command line but then you'd have to pass some stack parameters. See [CDK documentation: Deploying with parameters](https://docs.aws.amazon.com/cdk/latest/guide/parameters.html#parameters_deploy).

```sh
cd accelerator/installer
pnpx cdk deploy --parameters GithubBranch=main --parameters ConfigS3Bucket=ASEA-myconfigbucket
```

### 1.9.2. Local Initial Setup Stack

There is a script called `cdk.sh` in `src/core/cdk` that allows you to deploy the Initial Setup stack.

The script sets the required environment variables and makes sure all workspace projects are built before deploying the CDK stack.

### 1.9.3. Phase Stacks

There is a script called `cdk.sh` in `src/deployments/cdk` that allows you to deploy a phase stack straight from the command-line without having to deploy the Initial Setup stack first.

The script enables development mode which means that accounts, organizations, configuration, limits and outputs will be loaded from the local environment instead of loading the values from DynamoDB. The local files that need to be available in the `src/deployments/cdk` folder are the following.

1. `accounts.json` based on `accelerator/accounts` (-Parameters table)

```json
[
    {
        "key": "shared-network",
        "id": "000000000001",
        "arn": "arn:aws:organizations::000000000000:account/o-0123456789/000000000001",
        "name": "myacct-ASEA-shared-network",
        "email": "myacct+ASEA-mandatory-shared-network@example.com",
        "ou": "core"
    },
    {
        "key": "operations",
        "id": "000000000002",
        "arn": "arn:aws:organizations::000000000000:account/o-0123456789/000000000002",
        "name": "myacct-ASEA-operations",
        "email": "myacct+ASEA-mandatory-operations@example.com",
        "ou": "core"
    }
]
```

2. `organizations.json` based on `accelerator/organizations` (-Parameters table)

```json
[
    {
        "ouId": "ou-0000-00000000",
        "ouArn": "arn:aws:organizations::000000000000:ou/o-0123456789/ou-0000-00000000",
        "ouName": "core",
        "ouPath": "core"
    },
    {
        "ouId": "ou-0000-00000001",
        "ouArn": "arn:aws:organizations::000000000000:ou/o-0123456789/ou-0000-00000001",
        "ouName": "prod",
        "ouPath": "prod"
    }
]
```

3. `limits.json` based on `accelerator/limits` (-Parameters table)

```json
[
    {
        "accountKey": "shared-network",
        "limitKey": "Amazon VPC/VPCs per Region",
        "serviceCode": "vpc",
        "quotaCode": "L-F678F1CE",
        "value": 15,
        "region": "ca-central-1"
    },
    {
        "accountKey": "shared-network",
        "limitKey": "Amazon VPC/Interface VPC endpoints per VPC",
        "serviceCode": "vpc",
        "quotaCode": "L-29B6F2EB",
        "value": 50,
        "region": "ca-central-1"
    }
]
```

4. `outputs.json` based on the -Outputs table

```json
[
    {
        "accountKey": "shared-network",
        "outputKey": "DefaultBucketOutputC7CE5936",
        "outputValue": "{\"type\":\"AccountBucket\",\"value\":{\"bucketArn\":\"arn:aws:s3:::ASEA-sharednetwork-phase1-cacentral1-18vq0emthri3h\",\"bucketName\":\"ASEA-sharednetwork-phase1-cacentral1-18vq0emthri3h\",\"encryptionKeyArn\":\"arn:aws:kms:ca-central-1:0000000000001:key/d54a8acb-694c-4fc5-9afe-ca2b263cd0b3\",\"region\":\"ca-central-1\"}}"
    }
]
```

5. `context.json` that contains the default values for values that are otherwise passed as environment variables.

```json
{
    "acceleratorName": "ASEA",
    "acceleratorPrefix": "ASEA-",
    "acceleratorExecutionRoleName": "ASEA-PipelineRole",
    "defaultRegion": "ca-central-1"
}
```

6. `config.json` that contains the Accelerator configuration.

The script also sets the default execution role to allow CDK to assume a role in subaccounts to deploy the phase stacks.

Now that you have all the required local files you can deploy the phase stacks using `cdk.sh`.

```bash
cd src/deployments/cdk
./cdk.sh deploy --phase 1                             # deploy all phase 1 stacks
./cdk.sh deploy --phase 1 --parallel                  # deploy all phase 1 stacks in parallel
./cdk.sh deploy --phase 1 --account shared-network    # deploy phase 1 stacks for account shared-network in all regions
./cdk.sh deploy --phase 1 --region ca-central-1       # deploy phase 1 stacks for region ca-central-1 for all accounts
./cdk.sh deploy --phase 1 --account shared-network --region ca-central-1 # deploy phase 1 stacks for account shared-network and region ca-central
```

Other CDK commands are also available.

```bash
cd src/deployments/cdk
./cdk.sh bootstrap --phase 1
./cdk.sh synth --phase 1
```

## 1.10. Testing

We use `jest` for unit testing. There are no integration tests but this could be set-up by configuring the `Installer` CodePipeline to have a webhook on the repository and deploying changes automatically.

To run unit tests locally you can run the following command in the monorepo.

```bash
pnpx recursive run test -- --pass-with-no-tests --silent
```

See CDK's documentation on [Testing constructs](https://docs.aws.amazon.com/cdk/latest/guide/testing.html) for more information on how to tests CDK constructs.

### 1.10.1. Validating Immutable Property Changes and Logical ID Changes

The most important unit test in this project is one that validates that logical IDs and immutable properties do not change unexpectedly. To avoid the issues described in section [Resource Names and Logical IDs](./best-practices.md#122-resource-names-and-logical-ids), [Changing Logical IDs](./best-practices.md#123-changing-logical-ids) and [Changing (Immutable) Properties](./best-practices.md#124-changing-immutable-properties).

This test can be found in the `src/deployments/cdk/test/apps/unsupported-changes.spec.ts` file. It synthesizes the `Phase` stacks using mocked outputs and uses [`jest` snapshots](https://jestjs.io/docs/en/snapshot-testing) to compare against future changes.

The test will fail when changing immutable properties or changing logical IDs of existing resources. In case the changes are expected then the snapshots will need to be updated. You can update the snapshots by running the following command.

```sh
pnpx run test -- -u
```

See [Accept Unit Test Snapshot Changes](./contributing-guidelines.md#16-accept-unit-test-snapshot-changes).

### 1.10.2. Upgrade CDK

There's a test in the file `src/deployments/cdk/test/apps/unsupported-changes.spec.ts` that is currently commented out. The test takes a snapshot of the whole `Phase` stack and compares the snapshot to changes in the code.

```typescript
test('templates should stay exactly the same', () => {
    for (const [stackName, resources] of Object.entries(stackResources)) {
        // Compare the relevant properties to the snapshot
        expect(resources).toMatchSnapshot(stackName);
    }
});
```

Before upgrading CDK we uncomment this test. We run the test to update all the snapshots. Then we update all CDK versions and run the test again to compare the snapshots with the code using the new CDK version. If the test passes, then the upgrade should be stable.

> _Action Item:_ Automate this process.
