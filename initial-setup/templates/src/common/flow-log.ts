import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';

export interface FlowLogProps {
  /**
   * The ID of the VPC to enable flow logging for.
   */
  vpcId: string;
  /**
   * The bucket where to write the logs to.
   */
  bucketArn: string;
}

/**
 * Auxiliary construct that enables flow log for the given VPC.
 */
export class FlowLog extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: FlowLogProps) {
    super(scope, id);

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogDelivery', 'logs:DeleteLogDelivery'],
        resources: ['*'],
      }),
    );

    new ec2.CfnFlowLog(this, 'FlowLog', {
      deliverLogsPermissionArn: role.roleArn,
      resourceId: props.vpcId,
      resourceType: 'VPC',
      trafficType: ec2.FlowLogTrafficType.ALL,
      logDestination: `${props.bucketArn}/flowlogs`,
      logDestinationType: ec2.FlowLogDestinationType.S3,
    });
  }
}
