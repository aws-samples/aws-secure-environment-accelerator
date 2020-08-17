import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

const resourceType = 'Custom::EC2LaunchTime';

export interface InstanceLaunchTimeProps {
  instanceId: string;
}

/**
 * Custom resource implementation that get EC2 instance status.
 */
export class InstanceLaunchTime extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: InstanceLaunchTimeProps) {
    super(scope, id);

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ec2-launch-time-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['ec2:DescribeInstances'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        InstanceId: props.instanceId,
      },
    });
  }

  get launchTime(): string {
    return this.resource.getAttString('LaunchTime');
  }
}
