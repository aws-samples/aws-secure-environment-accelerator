import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as config from '@aws-cdk/aws-config';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

export interface CustomRuleProps extends Omit<config.CustomRuleProps, 'lambdaFunction'> {
  roleArn: string;
  lambdaRuntime: string;
  runtimeS3Bucket: string;
  runtimeS3Key: string;
}

export class CustomRule extends cdk.Construct {
  private readonly constructName: string;
  private role: iam.IRole;
  private runtimeS3Bucket: string;
  private runtimeS3Key: string;
  private lambdaRuntime: string;
  resource: config.CustomRule;
  constructor(scope: cdk.Construct, name: string, props: CustomRuleProps) {
    super(scope, name);
    this.constructName = `${name}Lambda`;
    this.role = iam.Role.fromRoleArn(this, `${name}Role`, props.roleArn);
    this.runtimeS3Bucket = props.runtimeS3Bucket;
    this.runtimeS3Key = props.runtimeS3Key.endsWith('.zip') ? props.runtimeS3Key : props.runtimeS3Key + '.zip';
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

    const s3Bucket = s3.Bucket.fromBucketAttributes(this, 'CodeBucket', {
      bucketName: this.runtimeS3Bucket,
    });
    const lambdaFunction = new lambda.Function(this, 'Lambda', {
      runtime: new lambda.Runtime(this.lambdaRuntime),
      code: lambda.Code.fromBucket(s3Bucket, this.runtimeS3Key),
      handler: 'index.handler',
      role: this.role,
    });

    return lambdaFunction;
  }
}
