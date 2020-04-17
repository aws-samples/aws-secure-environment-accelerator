import * as cdk from '@aws-cdk/core';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoints } from '../common/interface-endpoints';
import { Vpc } from '../common/vpc';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

export namespace Perimeter {
  export interface StackProps extends AcceleratorStackProps {
    accountConfig: AccountConfig;
  }

  export class Stack extends AcceleratorStack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const { accountConfig } = props;
      const vpcConfig = accountConfig.vpc;
      if (!vpcConfig) {
        console.log('No VPC Config Specified for Master Account');
        return;
      }

      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpc = new Vpc(this, 'vpc', {
        vpcConfig
      });

      // Creating Interface endpoints
      new InterfaceEndpoints(this, 'InterfaceEndpoints', {
        vpc,
        accountConfig,
      });

      // Add outputs to Stack
      new cdk.CfnOutput(this, `${vpcConfig.name}`, {
        value: vpc.vpcId,
      });

      for (const [key, value] of vpc.subnets) {
        new cdk.CfnOutput(this, `${key}`, {
          value,
        });
      }
    }
  }
}
