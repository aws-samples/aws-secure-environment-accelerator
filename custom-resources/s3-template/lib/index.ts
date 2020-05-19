import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import { HandlerProperties, TemplateParameters } from '@custom-resources/s3-template-lambda';

const resourceType = 'Custom::S3Template';

export interface S3TemplateProps {
  templateBucket: s3.IBucket;
  templatePath: string;
  outputBucket: s3.IBucket;
  outputPath: string;
}

/**
 * Custom resource that has an VPN tunnel options attribute for the VPN connection with the given ID.
 */
export class S3Template extends cdk.Construct {
  private readonly handlerProperties: HandlerProperties;

  constructor(scope: cdk.Construct, id: string, props: S3TemplateProps) {
    super(scope, id);

    this.handlerProperties = {
      templateBucketName: props.templateBucket.bucketName,
      templatePath: props.templatePath,
      outputBucketName: props.outputBucket.bucketName,
      outputPath: props.outputPath,
      parameters: {},
    };

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...this.handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
      },
    });

    props.templateBucket.grantRead(this.role);
    props.outputBucket.grantWrite(this.role);
  }

  addReplacement(key: string, value: string) {
    this.handlerProperties.parameters[key] = value;
  }

  get lambdaFunction(): lambda.Function {
    return this.ensureLambdaFunction();
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  private ensureLambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/s3-template-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
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
