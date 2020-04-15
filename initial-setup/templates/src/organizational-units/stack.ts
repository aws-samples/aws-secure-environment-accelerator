import * as cdk from '@aws-cdk/core';
import { Vpc } from '../common/vpc';
import { OrganizationalUnits } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

export namespace OrganizationalUnit {
  export interface StackProps extends AcceleratorStackProps {
    organizationalUnits: OrganizationalUnits;
  }

  export class Stack extends AcceleratorStack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const orgUnitProps = props.organizationalUnits;

      const vpcConfig = orgUnitProps.central.vpc!;
      const vpc = new Vpc(this, 'vpc', vpcConfig);

      // Add Outputs to Stack

      // Adding Output for VPC
      new cdk.CfnOutput(this, `Vpc${vpcConfig.name}`, {
        value: vpc.vpcId,
      });

      // Adding Outputs for Subnets
      for (const [key, value] of vpc.subnets) {
        new cdk.CfnOutput(this, `${vpcConfig.name}Subnet${key}`, {
          value,
        });
      }

      // Adding Outputs for RouteTables
      for (const [key, value] of vpc.routeTableNameToIdMap) {
        new cdk.CfnOutput(this, `${vpcConfig.name}RouteTable${key}`, {
          value,
        });
      }
    }
  }
}
