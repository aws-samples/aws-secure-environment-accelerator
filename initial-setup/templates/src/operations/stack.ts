import * as cdk from '@aws-cdk/core';
import { ResourceTags } from '../common/attach-tags';

export namespace Operations {
  export interface StackProps extends cdk.StackProps {
    accounts: { key: string; id: string }[];
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
      super(scope, id, props);
      //TODO Attach Tags to the Subnets shared by shared-Network account
    }
  }
}
