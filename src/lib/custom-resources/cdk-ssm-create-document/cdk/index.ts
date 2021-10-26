import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::SSMDocument';

export interface SSMDocumentProps {
  content: string;
  name: string;
  type: string;
  roleArn: string;
}

export interface SSMDocumentRuntimeProps extends Omit<SSMDocumentProps, 'roleArn'> {}

/**
 * Custom resource that will create SSM Document.
 */
export class SSMDocument extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: SSMDocumentProps) {
    super(scope, id);

    const runtimeProps: SSMDocumentRuntimeProps = props;
    const ssmDocumentShareLambda = this.lambdaFunction(props.roleArn);
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: ssmDocumentShareLambda.functionArn,
      properties: {
        ...runtimeProps,
      },
    });
  }

  get name(): string {
    return this.resource.getAttString('DocumentName');
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ssm-create-document-runtime');
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
