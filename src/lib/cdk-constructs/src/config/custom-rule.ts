import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as config from '@aws-cdk/aws-config';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

export interface CustomRuleProps extends Omit<config.CustomRuleProps, 'lambdaFunction'> {
  roleArn: string;
  configRule: string;
}

export class CustomRule extends cdk.Construct {
  private readonly constructName: string;
  private role: iam.IRole;
  resource: config.CustomRule;
  private ruleName: string;
  constructor(scope: cdk.Construct, name: string, props: CustomRuleProps) {
    super(scope, name);
    this.constructName = `${name}Lambda`;
    this.role = iam.Role.fromRoleArn(this, `${name}Role`, props.roleArn);
    this.ruleName = props.configRule;
    this.resource = new config.CustomRule(this, 'Resource', {
      lambdaFunction: this.ensureLambda(),
      ...props,
    });
  }

  private ensureLambda(): lambda.Function {
    const constructName = this.constructName;

    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    // node_modules/@aws-accelerator/config-rule-runtime-${ruleName}
    const lambdaPath = require.resolve(`@aws-accelerator/config-rule-runtime-${this.ruleName}`);
    // node_modules/@aws-accelerator/config-rule-runtime-${ruleName}/dist
    const lambdaDir = path.dirname(lambdaPath);

    const lambdaFunction = new lambda.Function(this, 'Lambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.role,
    });

    return lambdaFunction;
  }
}
