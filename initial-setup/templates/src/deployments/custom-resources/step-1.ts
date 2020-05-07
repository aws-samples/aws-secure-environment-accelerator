import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib/webpack-build';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account } from '../../utils/accounts';
import { Context } from '../../utils/context';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { JsonOutputValue } from '../../common/json-output';
import { pascalCase } from 'pascal-case';

export interface Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
  context: Context;
}

/**
 * Creates the custom resources.
 */
export async function create(props: Props) {
  await createCustomResourceFunctions(props);
}

/**
 * Creates all the custom resource functions in the primary stack.
 */
async function createCustomResourceFunctions(props: Props) {
  const { accountStacks, accounts, config, context } = props;

  // Find the primary stack to deploy the resources into
  const primary = config
    .getAccountConfigs()
    .find(([_, accountConfig]) => accountConfig['landing-zone-account-type'] === 'primary');
  if (!primary) {
    throw new Error('Cannot find primary account in Accelerator configuration');
  }

  // Custom resources will be deployed in the primary stack
  const primaryStack = accountStacks.getOrCreateAccountStack(primary[0]);

  // Compile the custom resources using Webpack
  const customResources = await WebpackBuild.build({
    workingDir: path.join(__dirname, '..', '..', '..', '..', '..', 'common', 'custom-resources'),
    webpackConfigFile: 'webpack.config.ts',
  });

  // The code is located in the root of the compiled package
  const customResourcesCode = customResources.codeForEntry();

  // Create all custom resources
  const imageFinderFunc = createImageFinderFunc({ primaryStack, customResourcesCode });

  // All accounts need permissions to invoke the function
  const functions = [imageFinderFunc];
  for (const account of accounts) {
    const principal = new iam.ArnPrincipal(`arn:aws:iam::${account.id}:role/${context.acceleratorExecutionRoleName}`);
    for (const func of functions) {
      func.addPermission(`Permission${pascalCase(account.key)}`, {
        action: 'lambda:InvokeFunction',
        principal,
      });
    }
  }

  // Store the output of step 1
  Output.createOutput(primaryStack, 'CustomResourcesStep1Output', {
    imageFinderFuncArn: imageFinderFunc.functionArn,
  });
}

/**
 * Creates the custom resource function for the image finder.
 */
function createImageFinderFunc(props: { primaryStack: cdk.Stack; customResourcesCode: lambda.Code }) {
  const imageFinderRole = new iam.Role(props.primaryStack, 'ImageFinderRole', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  // Grant permissions to write logs
  imageFinderRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );

  imageFinderRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['ec2:DescribeImages'],
      resources: ['*'],
    }),
  );

  return new lambda.Function(props.primaryStack, 'ImageFinderFunc', {
    runtime: lambda.Runtime.NODEJS_12_X,
    code: props.customResourcesCode,
    handler: 'index.imageFinder',
    role: imageFinderRole,
  });
}

export interface Output {
  imageFinderFuncArn: string;
}

export namespace Output {
  const type = 'CustomResourcesStep1';

  export function createOutput(scope: cdk.Construct, id: string, output: Output) {
    new JsonOutputValue(scope, id, {
      type,
      value: output,
    });
  }

  export function findInStackOutputs(stackOutputs: StackOutput[]): Output {
    const outputs = getStackJsonOutput(stackOutputs, {
      outputType: type,
    });
    if (outputs.length !== 1) {
      throw new Error(`Cannot find custom resources output`);
    }
    return outputs[0];
  }
}
