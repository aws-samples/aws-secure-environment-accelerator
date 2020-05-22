import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import { HandlerProperties } from '@custom-resources/s3-copy-files-lambda';

const resourceType = 'Custom::S3CopyFiles';

export interface S3CopyFilesProps {
  sourceBucket: s3.IBucket;
  destinationBucket: s3.IBucket;
  roleName?: string;
}

/**
 * Custom resource that has an VPN tunnel options attribute for the VPN connection with the given ID.
 */
export class S3CopyFiles extends cdk.Construct {
  private readonly props: S3CopyFilesProps;

  constructor(scope: cdk.Construct, id: string, props: S3CopyFilesProps) {
    super(scope, id);

    this.props = props;

    props.sourceBucket.grantRead(this.role);
    props.destinationBucket.grantReadWrite(this.role);

    const handlerProperties: HandlerProperties = {
      sourceBucketName: props.sourceBucket.bucketName,
      destinationBucketName: props.destinationBucket.bucketName,
    };

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
      },
    });
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/s3-copy-files-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      roleName: this.props.roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudformation:DescribeStackResource',
          'kms:Decrypt',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
    });
  }
}
