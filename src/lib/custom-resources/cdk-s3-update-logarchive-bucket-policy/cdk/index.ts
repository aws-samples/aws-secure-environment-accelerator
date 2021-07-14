import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import { HandlerProperties } from '@aws-accelerator/custom-resource-s3-update-logarchive-policy-runtime';

const resourceType = 'Custom::S3UpdateLogArchivePolicy';

export interface LogArchiveReadAccessProps {
  roles: string[];
  logBucket: s3.IBucket;
  removalPolicy?: cdk.RemovalPolicy;
  acceleratorPrefix: string;
}

/**
 * Adds IAM roles with {'ssm-log-archive-read-only-access': true} to the LogArchive bucket policy
 */
export class S3UpdateLogArchivePolicy extends cdk.Construct {
  private resource: cdk.CustomResource | undefined;

  constructor(scope: cdk.Construct, id: string, private readonly props: LogArchiveReadAccessProps) {
    super(scope, id);

    const { roles, logBucket, acceleratorPrefix } = props;
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  protected onPrepare() {
    const handlerProperties: HandlerProperties = {
      roles: this.props.roles,
      logBucketArn: this.props.logBucket.bucketArn,
      logBucketName: this.props.logBucket.bucketName,
      logBucketKmsKeyArn: this.props.logBucket.encryptionKey?.keyArn,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      removalPolicy: this.props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
      properties: handlerProperties,
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-s3-update-logarchive-policy-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      roleName: `${this.props.acceleratorPrefix}S3UpdateLogArchivePolicy`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetBucketPolicy',
          's3:PutBucketPolicy',
          'kms:GetKeyPolicy',
          'kms:PutKeyPolicy',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'tag:GetResources',
        ],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(30),
      deadLetterQueueEnabled: true,
    });
  }
}
