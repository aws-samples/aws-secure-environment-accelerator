import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/ec2-ebs-default-encryption-lambda';

const resourceType = 'Custom::EBSDefaultEncryption';

export interface EbsDefaultEncryptionProps {
  key: kms.IKey;
}

export class EbsDefaultEncryption extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, private readonly props: EbsDefaultEncryptionProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      KmsKeyId: props.key.keyId,
    };

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
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

    const lambdaPath = require.resolve('@custom-resources/ec2-ebs-default-encryption-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:GetEbsDefaultKmsKeyId',
          'ec2:GetEbsEncryptionByDefault',
          'ec2:DisableEbsEncryptionByDefault',
          'ec2:EnableEbsEncryptionByDefault',
          'ec2:ModifyEbsDefaultKmsKeyId',
          'ec2:ResetEbsDefaultKmsKeyId',
        ],
        resources: ['*'],
      }),
    );

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['kms:DescribeKey'],
        resources: [this.props.key.keyArn],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(10),
    });
  }
}
