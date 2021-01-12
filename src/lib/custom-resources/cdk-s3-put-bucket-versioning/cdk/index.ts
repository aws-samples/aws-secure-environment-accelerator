import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::S3PutBucketVersioning';

export interface S3PutBucketVersioningProps {
  bucketName: string;
  roleArn: string;
  logRetention?: number;
}

export interface S3PutBucketVersioningRuntimeProps extends Omit<S3PutBucketVersioningProps, 'roleArn'> {}
/**
 * Custom resource that will create SSM Document.
 */
export class S3PutBucketVersioning extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  private role: iam.IRole;

  constructor(scope: cdk.Construct, id: string, props: S3PutBucketVersioningProps) {
    super(scope, id);
    this.role = iam.Role.fromRoleArn(this, `${resourceType}Role`, props.roleArn);

    const runtimeProps: S3PutBucketVersioningRuntimeProps = props;
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...runtimeProps,
      },
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-s3-put-bucket-versioning-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
