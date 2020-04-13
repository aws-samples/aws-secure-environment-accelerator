import * as ec2 from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from './vpc';

interface GatewayEndpointProps {
  serviceName: string;
  vpcId: string;
}

class GatewayEndpoint extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: GatewayEndpointProps) {
    super(scope, id);

    const { serviceName, vpcId } = props;

    new ec2.CfnVPCEndpoint(this, 'VpcEndpoint', {
      serviceName,
      vpcEndpointType: ec2.VpcEndpointType.GATEWAY,
      vpcId,
    });
  }
}

export interface GatewayEndpointsProps {
  vpc: Vpc;
  accountConfig: AccountConfig;
}

export class GatewayEndpoints extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: GatewayEndpointsProps) {
    super(scope, id);

    const { vpc, accountConfig } = props;

    const vpcConfig = accountConfig.vpc;
    const gatewayEndpoints = vpcConfig['gateway-endpoints'] || [];
    for (const gatewayEndpoint of gatewayEndpoints) {
      new GatewayEndpoint(this, gatewayEndpoint, {
        serviceName: gatewayEndpoint.toLowerCase(),
        vpcId: vpc.vpcId,
      });
    }
  }
}
