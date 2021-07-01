import * as cdk from '@aws-cdk/core';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import * as ec2 from '@aws-cdk/aws-ec2';
import { RegionInfo, Default } from '@aws-cdk/region-info';

export interface GatewayLoadBalancerProps extends cdk.StackProps {
  name: string;
  vpcId: string;
  subnetIds: string[];
  ipType: string;
  crossZone: boolean;
}

interface ElbEndpoint {
  az: string;
  id: string;
  vpc: string;
  subnet: string;
  accountKey: string;
}

export class GatewayLoadBalancer extends cdk.Construct {
  private readonly resource: elb.CfnLoadBalancer;
  private readonly listeners: elb.CfnListener[] = [];
  private readonly endpointService: ec2.CfnVPCEndpointService;

  constructor(scope: cdk.Construct, id: string, private readonly props: GatewayLoadBalancerProps) {
    super(scope, id);

    const { name, subnetIds, ipType, crossZone, tags } = props;

    this.resource = new elb.CfnLoadBalancer(this, 'Gwlb', {
      name,
      ipAddressType: ipType,
      subnets: subnetIds,
      type: 'gateway',
      loadBalancerAttributes: [
        {
          key: 'deletion_protection.enabled',
          value: 'true',
        },
        {
          key: 'load_balancing.cross_zone.enabled',
          value: String(crossZone),
        },
      ],
      tags: Object.entries(tags || {}).map(([key, value]) => ({ key, value })),
    });

    this.endpointService = new ec2.CfnVPCEndpointService(this, 'GwlbVpcEndpointService', {
      gatewayLoadBalancerArns: [this.resource.ref],
    });
  }

  addListener(props: { targetGroup: { name: string; arn: string }; actionType: string }) {
    const { actionType, targetGroup } = props;
    const cfnListnerProps: elb.CfnListenerProps = {
      loadBalancerArn: this.resource.ref,
      defaultActions: [
        {
          type: actionType,
          targetGroupArn: targetGroup.arn,
        },
      ],
    };
    const listener = new elb.CfnListener(this, `Listener-${targetGroup.name}`, cfnListnerProps);
    this.listeners.push(listener);
  }

  get name(): string {
    return this.resource.name!;
  }

  get dns(): string {
    const regionInfo = RegionInfo.get(cdk.Aws.REGION);
    return `${regionInfo.vpcEndpointServiceNamePrefix || Default.VPC_ENDPOINT_SERVICE_NAME_PREFIX}.${cdk.Aws.REGION}.${
      this.endpointService.ref
    }`;
  }

  get hostedZoneId(): string {
    return this.resource.attrCanonicalHostedZoneId;
  }

  get arn(): string {
    return this.resource.ref;
  }

  get service(): string {
    return this.endpointService.ref;
  }
}
