import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import { HandlerProperties } from '@aws-accelerator/custom-resource-s3-copy-files-runtime';

const resourceType = 'Custom::S3CopyFiles';

export interface S3CopyFilesProps {
  sourceBucket: s3.IBucket;
  destinationBucket: s3.IBucket;
  /**
   * @default false
   */
  deleteSourceObjects?: boolean;
  /**
   * @default false
   */
  deleteSourceBucket?: boolean;
  /**
   * @default true
   */
  forceUpdate?: boolean;
  /**
   * The role name that is created for the custom resource Lambda function.
   */
  roleName?: string;
}

/**
 * Custom resource that has an VPN tunnel options attribute for the VPN connection with the given ID.
 */
export class S3CopyFiles extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, private readonly props: S3CopyFilesProps) {
    super(scope, id);

    props.destinationBucket.grantReadWrite(this.role);

    // Only grant write to the source when we need to delete the source object
    const deleteSourceObjects = props.deleteSourceObjects ?? false;
    if (deleteSourceObjects) {
      props.sourceBucket.grantReadWrite(this.role);
    } else {
      props.sourceBucket.grantRead(this.role);
    }

    // Only grant delete bucket when we need to delete the bucket
    const deleteSourceBucket = props.deleteSourceBucket ?? false;
    if (deleteSourceBucket) {
      iam.Grant.addToPrincipalOrResource({
        grantee: this.role,
        actions: ['s3:DeleteBucket'],
        resourceArns: [props.sourceBucket.bucketArn],
        resource: props.sourceBucket,
      });
    }

    const handlerProperties: HandlerProperties = {
      sourceBucketName: props.sourceBucket.bucketName,
      destinationBucketName: props.destinationBucket.bucketName,
      deleteSourceObjects,
      deleteSourceBucket,
    };

    const forceUpdate = props.forceUpdate ?? true;
    if (forceUpdate) {
      // Add a dummy value that is a random number to update the resource every time
      handlerProperties.forceUpdate = Math.round(Math.random() * 1000000);
    }

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-s3-copy-files-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      roleName: this.props.roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
