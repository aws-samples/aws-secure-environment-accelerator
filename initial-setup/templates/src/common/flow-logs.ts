import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';

export interface FlowLogsProps {
  vpcId: string;
  bucketArn: string;
}

export class FlowLogs extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: FlowLogsProps) {
    super(scope, id);

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogDelivery', 'logs:DeleteLogDelivery'],
        resources: ['*'],
      }),
    );

    new ec2.CfnFlowLog(this, 'FlowLog', {
      deliverLogsPermissionArn: role.roleArn,
      resourceId: props.vpcId,
      resourceType: 'VPC',
      trafficType: 'ALL',
      logDestination: `${props.bucketArn}/flowlogs`,
      logDestinationType: 's3',
    });
  }
}
