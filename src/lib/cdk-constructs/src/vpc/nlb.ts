import * as cdk from '@aws-cdk/core';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';

export interface NetworkLoadBalancerProps extends cdk.StackProps {
  nlbName: string;
  scheme: string;
  subnetIds: string[];
  ipType: string;
}

export class NetworkLoadBalancer extends cdk.Construct {
  private readonly resource: elb.CfnLoadBalancer;
  private readonly listeners: elb.CfnListener[] = [];

  constructor(scope: cdk.Construct, id: string, private readonly props: NetworkLoadBalancerProps) {
    super(scope, id);

    const { nlbName, scheme, subnetIds, ipType } = props;

    this.resource = new elb.CfnLoadBalancer(this, `Nlb${nlbName}`, {
      name: nlbName,
      ipAddressType: ipType,
      scheme,
      subnets: subnetIds,
      type: 'network',
    });
  }

  addListener(props: { ports: number; protocol: string; actionType: string; targetGroupArns: string[] }) {
    const { ports, protocol, actionType, targetGroupArns } = props;
    const targetGroups = targetGroupArns.map(arn => ({
      targetGroupArn: arn,
    }));
    const listener = new elb.CfnListener(this, `Listener${this.listeners.length}`, {
      port: ports,
      loadBalancerArn: this.resource.ref,
      protocol,
      defaultActions: [
        {
          type: actionType,
          forwardConfig: {
            targetGroups,
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
}
