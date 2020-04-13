import * as cdk from '@aws-cdk/core';
import { ResourceTags } from '../common/attach-tags';

export namespace Operations {
  export interface StackProps extends cdk.StackProps {
    accounts: { key: string; id: string }[];
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
      super(scope, id, props);

      const resourceTags = [
        { Resources: ['subnet-048c29b8cc44159bb'], Tags: [{ Key: 'Name', Value: 'Web_az1' }] },
        { Resources: ['subnet-0d9d6e80ac0eb6c54'], Tags: [{ Key: 'Name', Value: 'Web_az2' }] },
      ];

      const attachTags = new ResourceTags(this, 'attach-tags', resourceTags[0]);
    }
  }
}
