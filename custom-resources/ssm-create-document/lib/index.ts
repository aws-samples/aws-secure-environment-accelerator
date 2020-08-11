import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::SSMDocument';

export interface SSMDocumentProps {
  roleArn: string;
  s3BucketName: string;
  s3KeyPrefix: string;
  s3EncryptionEnabled: boolean;
  cloudWatchLogGroupName: string;
  cloudWatchEncryptionEnabled: boolean;
  kmsKeyId: string;
  documentName: string;
  documentType: string;
}

/**
 * Custom resource that will create SSM Document.
 */
export class SSMDocument extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: SSMDocumentProps) {
    super(scope, id);
    const {
      cloudWatchEncryptionEnabled,
      cloudWatchLogGroupName,
      documentName,
      kmsKeyId,
      roleArn,
      s3BucketName,
      s3EncryptionEnabled,
      s3KeyPrefix,
      documentType,
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
        documentName,
        documentType,
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

    const lambdaPath = require.resolve('@custom-resources/ssm-create-document-lambda');
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
