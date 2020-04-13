import * as cdk from '@aws-cdk/core';
import { Vpc } from '../common/vpc';
import { OrganizationalUnits } from '@aws-pbmm/common-lambda/lib/config';
import { KeyObject } from 'crypto';

export namespace OrganizationalUnit {
  export interface StackProps extends cdk.StackProps {
    organizationalUnits: OrganizationalUnits;
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const orgUnitProps = props.organizationalUnits;

      const vpcConfig = orgUnitProps.central.vpc!!;
      const vpc = new Vpc(this, 'vpc', vpcConfig);
    }
  }
}
