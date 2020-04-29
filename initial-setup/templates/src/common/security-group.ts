import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

import { VpcConfig } from '@aws-pbmm/common-lambda/lib/config';

export interface SecurityGroupProps {
  vpcConfig: VpcConfig;
  accountKey: string;
}

export class SecurityGroup extends cdk.Construct {
  constructor(parent: cdk.Construct, name: string, props: SecurityGroupProps) {
    super(parent, name);
  }
}
