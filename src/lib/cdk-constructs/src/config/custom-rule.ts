import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as config from '@aws-cdk/aws-config';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

export interface CustomRuleProps extends Omit<config.CustomRuleProps, 'lambdaFunction'> {
  roleArn: string;
  lambdaRuntime: string;
  runtimeFileLocation: string;
}

export class CustomRule extends cdk.Construct {
  private readonly constructName: string;
  private role: iam.IRole;
  private runtimeFileLocation: string;
  private lambdaRuntime: string;
  resource: config.CustomRule;
  constructor(scope: cdk.Construct, name: string, props: CustomRuleProps) {
    super(scope, name);
    this.constructName = `${name}Lambda`;
    this.role = iam.Role.fromRoleArn(this, `${name}Role`, props.roleArn);
    this.runtimeFileLocation = props.runtimeFileLocation.endsWith('.zip')
      ? props.runtimeFileLocation
      : props.runtimeFileLocation + '.zip';
    this.lambdaRuntime = props.lambdaRuntime;
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

    const lambdaFunction = new lambda.Function(this, 'Lambda', {
      runtime: new lambda.Runtime(this.lambdaRuntime),
      code: lambda.Code.fromAsset(this.runtimeFileLocation),
      handler: 'index.handler',
      role: this.role,
    });

    return lambdaFunction;
  }
}
