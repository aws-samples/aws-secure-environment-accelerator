import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::TGWCreatePeeringAttachment';

export interface TransitGatewayCreatePeeringAttachmentProps {
  transitGatewayId: string;
  targetTransitGatewayId: string;
  targetAccountId: string;
  targetRegion: string;
  tagValue: string;
  roleArn: string;
}

/**
 * Custom resource implementation that creates transit gateway peering attachment
 */
export class TransitGatewayCreatePeeringAttachment extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  private readonly role: iam.IRole;

  constructor(scope: cdk.Construct, id: string, props: TransitGatewayCreatePeeringAttachmentProps) {
    super(scope, id);

    const { transitGatewayId, targetTransitGatewayId, targetAccountId, targetRegion, tagValue } = props;
    this.role = iam.Role.fromRoleArn(scope, `${resourceType}Role`, props.roleArn);

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        transitGatewayId,
        targetTransitGatewayId,
        targetAccountId,
        targetRegion,
        tagValue,
      },
    });
  }

  get lambdaFunction(): lambda.Function {
    return this.ensureLambdaFunction();
  }

  /**
   * Returns the peeringAttachmentId CloudFormation attribute.
   */
  get attachmentId(): string {
    return this.resource.getAttString('peeringAttachmentId');
  }

  private ensureLambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-create-tgw-peering-attachment-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.role,
      timeout: cdk.Duration.minutes(10),
      deadLetterQueueEnabled: true,
    });
  }
}
