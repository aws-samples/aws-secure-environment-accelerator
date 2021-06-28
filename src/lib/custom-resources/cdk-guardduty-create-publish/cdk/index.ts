import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@aws-accelerator/custom-resource-guardduty-create-publish-runtime';

const resourceType = 'Custom::GuardDutyCreatePublish';

export interface GuardDutyCreatePublishProps {
  detectorId: string;
  destinationArn: string;
  kmsKeyArn: string;
  roleArn: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyCreatePublish extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyCreatePublishProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      detectorId: props.detectorId,
      destinationArn: props.destinationArn,
      kmsKeyArn: props.kmsKeyArn,
    };
    const guardDutyCreate = this.lambdaFunction(props.roleArn);
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: guardDutyCreate.functionArn,
      properties: handlerProperties,
    });
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-guardduty-create-publish-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(10),
      deadLetterQueueEnabled: true,
    });
  }
}
