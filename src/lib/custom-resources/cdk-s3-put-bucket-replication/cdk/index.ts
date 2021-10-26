import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::S3PutBucketReplication';

export interface S3PutBucketReplicationProps {
  replicationRole: string;
  bucketName: string;
  rules: unknown;
  roleArn: string;
}

export interface S3PutBucketReplicationRuntimeProps extends Omit<S3PutBucketReplicationProps, 'roleArn'> {}
/**
 * Custom resource that will create SSM Document.
 */
export class S3PutBucketReplication extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  private role: iam.IRole;

  constructor(scope: cdk.Construct, id: string, props: S3PutBucketReplicationProps) {
    super(scope, id);
    this.role = iam.Role.fromRoleArn(this, `${resourceType}Role`, props.roleArn);

    const runtimeProps: S3PutBucketReplicationRuntimeProps = props;
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-s3-put-bucket-replication-runtime');
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
