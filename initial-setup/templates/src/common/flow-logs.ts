import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';

export interface FlowLogsProps extends cdk.StackProps {
  vpcId: string;
}

export class FlowLogs extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: FlowLogsProps) {
    super(scope, id);

    const s3Bucket = new s3.Bucket(this, 'VpcFlowLogs');

    const flowLogRole = new iam.Role(this, 'RoleFlowLogs', {
      roleName: 'AcceleratorVPCFlowLogsRole',
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    flowLogRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogDelivery', 'logs:DeleteLogDelivery'],
        resources: ['*'],
      }),
    );

    new ec2.CfnFlowLog(this, 'VPCFlowLog', {
      deliverLogsPermissionArn: flowLogRole.roleArn,
      resourceId: props.vpcId!!,
      resourceType: 'VPC',
      trafficType: 'ALL',
      logDestination: s3Bucket.bucketArn,
      logDestinationType: 's3',
    });
  }
}
