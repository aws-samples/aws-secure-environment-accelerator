import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::SSMDocumentShare';

export interface SSMDocumentShareProps {
  name: string;
  accountIds: string[];
  roleArn: string;
}

/**
 * Custom resource that will create SSM Document.
 */
export class SSMDocumentShare extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: SSMDocumentShareProps) {
    super(scope, id);
    const { roleArn, name, accountIds } = props;
    const ssmDocumentShareLambda = this.lambdaFunction(roleArn);
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: ssmDocumentShareLambda.functionArn,
      properties: {
        accountIds,
        name,
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ssm-document-share-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(15),
      deadLetterQueueEnabled: true,
    });
  }
}
