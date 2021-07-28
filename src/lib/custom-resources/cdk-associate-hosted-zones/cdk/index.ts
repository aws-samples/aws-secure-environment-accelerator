import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::AssociateHostedZones';

export interface AssociateHostedZonesProps {
  assumeRoleName: string;
  vpcAccountId: string;
  vpcName: string;
  vpcId: string;
  vpcRegion: string;
  hostedZoneAccountId: string;
  hostedZoneIds: string[];
  roleArn: string;
}

/**
 * Currently this module is not being used
 */

export type AssociateHostedZonesRuntimeProps = Omit<AssociateHostedZonesProps, 'roleArn'>;

/**
 * Custom resource that will create SSM Document.
 */
export class AssociateHostedZones extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  private role: iam.IRole;

  constructor(scope: cdk.Construct, id: string, props: AssociateHostedZonesProps) {
    super(scope, id);
    this.role = iam.Role.fromRoleArn(this, `${resourceType}Role`, props.roleArn);

    const runtimeProps: AssociateHostedZonesRuntimeProps = props;
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...runtimeProps,
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-associate-hosted-zones-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
