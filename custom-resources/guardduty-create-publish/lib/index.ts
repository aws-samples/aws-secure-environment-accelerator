import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/guardduty-create-publish-lambda';

const resourceType = 'Custom::GuardDutyCreatePublish';

export interface GuardDutyCreatePublishProps {
  destinationArn: string;
  kmsKeyArn: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyCreatePublish extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyCreatePublishProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      destinationArn: props.destinationArn,
      kmsKeyArn: props.kmsKeyArn,
    };
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
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

    const lambdaPath = require.resolve('@custom-resources/guardduty-create-publish-lambda');
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
          's3:CreateBucket',
          's3:GetBucketLocation',
          's3:ListAllMyBuckets',
          's3:PutBucketAcl',
          's3:PutBucketPublicAccessBlock',
          's3:PutBucketPolicy',
          's3:PutObject',
        ],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'guardduty:createPublishingDestination',
          'guardduty:updatePublishingDestination',
          'guardduty:deletePublishingDestination',
          'guardduty:listPublishingDestinations',
        ],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['kms:ListAliases'],
        resources: ['*'],
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
