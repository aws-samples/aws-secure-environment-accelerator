# 1. Technology Stack

## 1.1. Overview

We use TypeScript, NodeJS, CDK and CloudFormation. You can find some more information in the sections below.

## 1.2. TypeScript and NodeJS

In the following sections we describe the tools and libraries used along with TypeScript.

### 1.2.1. pnpm

We use the `pnpm` package manager along with `pnpm workspaces` to manage all the packages in this monorepo.

https://pnpm.js.org

https://pnpm.js.org/en/workspaces

The binary `pnpx` runs binaries that belong to `pnpm` packages in the workspace.

https://pnpm.js.org/en/pnpx-cli

### 1.2.2. prettier

We use [`prettier`](https://prettier.io) to format code in this repository. A GitHub action makes sure that all the code in a pull requests adheres to the configured `prettier` rules. See [Github Actions](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/v1.5.6-a/.github/workflows/lint-prettier.yml#L61).

### 1.2.3. eslint

We use [`eslint`](https://eslint.org/) as a static analysis tool that checks our TypeScript code. A GitHub action makes sure that all the code in a pull requests adheres to the configured `eslint` rules. See [Github Actions](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/v1.5.6-a/.github/workflows/lint-prettier.yml#L61).

## 1.3. CloudFormation

CloudFormation deploys both the Accelerator stacks and resources and the deployed stacks and resources. See [Operations Guide: System Overview](../operations/index.md) for the distinction between Accelerator resources and deployed resources.

## 1.4. CDK

AWS CDK defines the cloud resources in a familiar programming language. While AWS CDK supports TypeScript, JavaScript, Python, Java, and C#/.Net, the contributions should be made in Typescript, as outlined in the [Accelerator Development First Principles](https://github.com/aws-samples/aws-secure-environment-accelerator/blob/ae8282d4537320763736fa56e05b743ce1c02611/CONTRIBUTING.md#accelerator-development-first-principles).

Developers can use programming languages to define reusable cloud components known as Constructs. You compose these together into Stacks and Apps. Learn more at https://docs.aws.amazon.com/cdk/latest/guide/home.html
