import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::SSMSessionManagerDocument';

export interface SSMSessionManagerDocumentProps {
  roleArn: string;
  s3BucketName: string;
  s3KeyPrefix: string;
  s3EncryptionEnabled: boolean;
  cloudWatchLogGroupName: string;
  cloudWatchEncryptionEnabled: boolean;
  kmsKeyId: string;
}

/**
 * Custom resource that will create SSM Document.
 */
export class SSMSessionManagerDocument extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: SSMSessionManagerDocumentProps) {
    super(scope, id);
    const {
      cloudWatchEncryptionEnabled,
      cloudWatchLogGroupName,
      kmsKeyId,
      roleArn,
      s3BucketName,
      s3EncryptionEnabled,
      s3KeyPrefix,
    } = props;

    const ssmCreateDocumentLambda = this.lambdaFunction(roleArn);
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: ssmCreateDocumentLambda.functionArn,
      properties: {
        s3BucketName,
        s3KeyPrefix,
        s3EncryptionEnabled,
        cloudWatchLogGroupName,
        cloudWatchEncryptionEnabled,
        kmsKeyId,
      },
    });
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/ssm-session-manager-document-lambda');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
