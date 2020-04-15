import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as cfn from '@aws-cdk/aws-cloudformation';

export interface TagProps extends cdk.StackProps {
  Resources: string[];
  Tags: { Key: string; Value: string }[];
}

export class ResourceTags extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: TagProps) {
    super(scope, id);

    const resourceTagRole = new iam.Role(this, 'ResourceTagsRole', {
      roleName: 'AcceleratorResourceTagsRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    const func = new lambda.Function(this, 'Handler', {
      timeout: cdk.Duration.minutes(1),
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../initial-setup/lambdas/src/custom-lambda'),
      role: resourceTagRole,
    });

    const resource = new cfn.CustomResource(this, 'TagResource', {
      provider: cfn.CustomResourceProvider.fromLambda(func),
      properties: props,
    });
  }
}
