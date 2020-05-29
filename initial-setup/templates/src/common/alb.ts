import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { CfnLoadBalancer, CfnListener } from '@aws-cdk/aws-elasticloadbalancingv2';

export interface AlbProps extends cdk.StackProps {
  albName: string;
  scheme: string;
  subnetIds: string[];
  securityGroupIds: string[];
  targetGroupArns: string[];
  ipType: string;
}

export class Alb extends cdk.Construct {
  private readonly resource: CfnLoadBalancer;
  private readonly listeners: CfnListener[] = [];

  constructor(scope: cdk.Construct, id: string, props: AlbProps) {
    super(scope, id);

    const { albName, scheme, subnetIds, securityGroupIds, ipType } = props;

    this.resource = new CfnLoadBalancer(this, 'Alb', {
      name: albName,
      ipAddressType: ipType,
      scheme: scheme,
      subnets: subnetIds,
      securityGroups: securityGroupIds,
    });
  }

  logToBucket(bucket: s3.IBucket) {
    this.resource.loadBalancerAttributes = [
      {
        key: 'access_logs.s3.enabled',
        value: 'true',
      },
      {
        key: 'access_logs.s3.bucket',
        value: bucket.bucketName,
      },
      {
        key: 'access_logs.s3.prefix',
        value: 'elb',
      },
    ];
  }

  addListener(props: {
    ports: number;
    protocol: string;
    sslPolicy: string;
    certificateArn: string;
    actionType: string;
    targetGroupArns: string[];
  }) {
    const { ports, protocol, sslPolicy, certificateArn, actionType, targetGroupArns } = props;
    const targetGroups = targetGroupArns.map(arn => ({
      targetGroupArn: arn,
      weight: 1,
    }));
    const listener = new CfnListener(this, `Listener${this.listeners.length}`, {
      port: ports,
      loadBalancerArn: this.resource.ref,
      protocol,
      sslPolicy,
      certificates: [{ certificateArn }],
      defaultActions: [
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
      ],
    });
    this.listeners.push(listener);
  }
}
