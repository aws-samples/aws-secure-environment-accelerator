import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';

export interface ApplicationLoadBalancerProps extends cdk.StackProps {
  albName: string;
  scheme: string;
  subnetIds: string[];
  securityGroupIds: string[];
  ipType: string;
}

export class ApplicationLoadBalancer extends cdk.Construct {
  private readonly resource: elb.CfnLoadBalancer;
  private readonly listeners: elb.CfnListener[] = [];

  constructor(scope: cdk.Construct, id: string, private readonly props: ApplicationLoadBalancerProps) {
    super(scope, id);

    const { albName, scheme, subnetIds, securityGroupIds, ipType } = props;

    this.resource = new elb.CfnLoadBalancer(this, 'Alb', {
      name: albName,
      ipAddressType: ipType,
      scheme,
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
        value: `${cdk.Aws.ACCOUNT_ID}/elb-${this.props.albName}`,
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
    const listener = new elb.CfnListener(this, `Listener${this.listeners.length}`, {
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

  get name(): string {
    return this.resource.name!;
  }

  get dns(): string {
    return this.resource.attrDnsName;
  }

  get hostedZoneId(): string {
    return this.resource.attrCanonicalHostedZoneId;
  }
}
