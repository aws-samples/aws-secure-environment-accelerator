import * as cdk from '@aws-cdk/core';
import * as cfn_inc from '@aws-cdk/cloudformation-include';

export namespace CfnJsonInclude {
  export interface Props {
    path: string;
  }
}

export class CfnJsonInclude extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: CfnJsonInclude.Props) {
    super(scope, id);

    new cfn_inc.CfnInclude(this, 'include', {
      templateFile: props.path,
    });
  }
}
