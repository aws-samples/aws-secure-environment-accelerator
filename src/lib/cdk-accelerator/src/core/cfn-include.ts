import * as cdk from '@aws-cdk/core';
import * as cfn_inc from '@aws-cdk/cloudformation-include';

export namespace CfnInclude {
  export interface Props {
    path: string;
  }
}

export class CfnInclude extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: CfnInclude.Props) {
    super(scope, id);

    new cfn_inc.CfnInclude(this, 'include', {
      templateFile: props.path,
    });
  }
}
