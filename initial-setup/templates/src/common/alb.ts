import * as cdk from '@aws-cdk/core';
import { AlbConfig } from '@aws-pbmm/common-lambda/lib/config';
import { CfnLoadBalancer, CfnListener } from '@aws-cdk/aws-elasticloadbalancingv2';

export interface AlbProps extends cdk.StackProps {
  albName: string;
  scheme: string;
  subnetIds: string[];
  securityGroupIds: string[];
  bucketName: string;
  certificateArn: string;
  targetGroupArns: string[];
  hasAccessLogs: boolean;
  port: string;
  protocol: string;
  actionType: string;
  ipType: string;
  securityPolicy: string;
}

export class Alb extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AlbProps) {
    super(scope, id);

    const {
      albName,
      scheme,
      hasAccessLogs,
      subnetIds,
      securityGroupIds,
      bucketName,
      certificateArn,
      port,
      protocol,
      actionType,
      ipType,
      securityPolicy,
      targetGroupArns,
    } = props;

    const applicationLoadBalancer = new CfnLoadBalancer(this, 'Alb', {
      name: albName,
      ipAddressType: ipType,
      scheme: scheme,
      subnets: subnetIds,
      securityGroups: securityGroupIds,
    });

    if (hasAccessLogs) {
      applicationLoadBalancer.loadBalancerAttributes = [
        {
          key: 'access_logs.s3.enabled',
          value: 'true',
        },
        {
          key: 'access_logs.s3.bucket',
          value: bucketName,
        },
        {
          key: 'access_logs.s3.prefix',
          value: 'elb',
        },
      ];
    }

    this.createAlbListener(
      `AlbListener${albName}`,
      port,
      applicationLoadBalancer.ref,
      protocol,
      securityPolicy,
      certificateArn,
      actionType,
      targetGroupArns,
    );
  }

  createAlbListener(
    listenerName: string,
    ports: string,
    loadBalancerArn: string,
    protocol: string,
    sslPolicy: string,
    certificateArn: string,
    actionType: string,
    targetGroupArns: string[],
  ): void {
    const albListener = new CfnListener(this, `${listenerName}`, {
      port: Number(ports),
      loadBalancerArn,
      protocol,
      defaultActions: [],
      sslPolicy,
      certificates: [{ certificateArn }],
    });

    const targetGroups = targetGroupArns.map(arn => ({
      targetGroupArn: arn,
      weight: 1,
    }));
    albListener.defaultActions = [
      {
        type: actionType,
        forwardConfig: {
          targetGroups,
          targetGroupStickinessConfig: {
            enabled: true,
            durationSeconds: 3600,
          },
        },
      },
    ];
  }
}
