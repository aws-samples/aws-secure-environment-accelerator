import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
// import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
// import { VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { CfnBucket } from '@aws-cdk/aws-s3';

export interface FlowLogsProps {
  vpcId: string;
  s3Bucket: CfnBucket;
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
      logDestination: props.s3Bucket.attrArn + '/flowlogs',
      logDestinationType: 's3',
    });
  }
}
