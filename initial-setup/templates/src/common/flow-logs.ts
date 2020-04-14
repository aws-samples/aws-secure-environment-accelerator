import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';

// import { VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { IBucket } from '@aws-cdk/aws-s3';

export interface FlowLogsProps extends cdk.StackProps {
  vpcId: string;
  s3Bucket: IBucket;
}

export class FlowLogs extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: FlowLogsProps) {
    super(scope, id);

    const flowLogRole = new iam.Role(this, id + `flowlogrole`, {
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
      resourceId: props.vpcId,
      resourceType: 'VPC',
      trafficType: 'ALL',
      logDestination: props.s3Bucket.bucketArn,
      logDestinationType: 's3',
    });
  }
}
