import * as cdk from '@aws-cdk/core';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoints } from '../common/interface-endpoints';
import { Vpc } from '../common/vpc';

export namespace Master {
  export interface StackProps extends cdk.StackProps {
    accountConfig: AccountConfig;
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const accountProps = props.accountConfig;

      // Create VPC, Subnets, RouteTables and Routes on Shared-Network Account
      const vpcConfig = accountProps.vpc!;

      const vpc = new Vpc(this, 'vpc', vpcConfig);

      new InterfaceEndpoints(this, 'InterfaceEndpoints', {
        vpc,
        accountConfig: accountProps,
      });
    }
  }
}
