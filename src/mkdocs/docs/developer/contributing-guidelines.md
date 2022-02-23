# How to Contribute

## How-to

## Adding New Functionality?

Before making a change or adding new functionality you have to verify what kind of functionality is being added.

- Is it an Accelerator-management change?
  - Is the change related to the `Installer` stack?
    - Is the change CDK related?
      - Make the change in `src/installer/cdk`.
    - Is the change runtime related?
      - Make the change in `src/installer/cdk/assets`.
  - Is the change related to the `Initial Setup` stack?
    - Is the change CDK related?
      - Make the change in `src/core/cdk`
    - Is the change runtime related?
      - Make the change in `src/core/runtime`
- Is it an Accelerator-managed change?
  - Is the change related to the `Phase` stacks?
    - Is the change CDK related?
      - Make the change in `src/deployments/cdk`
    - Is the change runtime related?
      - Make the change in `src/deployments/runtime`

## Create a CDK Lambda Function with Lambda Runtime Code

See [CDK Code Dependency on Lambda Function Code](#cdk-code-dependency-on-lambda-function-code) for a short introduction.

## Create a Custom Resource

See [Custom Resource](#custom-resource) and [Custom Resources](#custom-resources) for a short introduction.

1. Create a separate folder that contains the CDK and Lambda function runtime code, e.g. `src/lib/custom-resources/my-custom-resource`;
2. Create a folder `my-custom-resource` that contains the CDK code;
   1. Create a `package.json` file with a dependency to the `my-custom-resource/runtime` package;
   2. Create a `cdk` folder that contains the source of the CDK code;
3. Create a folder `my-custom-resource/runtime` that contains the runtime code;
   1. Create a `runtime/package.json` file with a `"name"`, `"prepare"` script and a `"main"`;
   2. Create a `runtime/webpack.config.ts` file that compiles TypeScript code to a single JavaScript file;
   3. Create a `runtime/src` folder that contains the source of the Lambda function runtime code;

You can look at the `src/lib/custom-resources/cdk-acm-import-certificate` custom resource as an example.

It is best practice to add tags to any resources that the custom resource creates using the `cfn-tags` library.

## Run All Unit Tests

Run in the root of the project.

```bash
pnpm recursive run test --no-bail --stream -- --silent
```

## Accept Unit Test Snapshot Changes

Run in `src/deployments/cdk`.

```bash
pnpm run test -- -u
```

## Validate Code with Prettier

Run in the root of the project.

```bash
pnpx prettier --check **/*.ts
```

## Format Code with Prettier

Run in the root of the project.

```bash
pnpx prettier --write **/*.ts
```

## Validate Code with `tslint`

Run in the root of the project.

```bash
pnpm recursive run lint --stream --no-bail
```
