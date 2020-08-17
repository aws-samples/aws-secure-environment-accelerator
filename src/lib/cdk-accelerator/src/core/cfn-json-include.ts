import * as cdk from '@aws-cdk/core';
import * as fs from 'fs';

export namespace CfnJsonInclude {
  export interface Props {
    path: string;
  }
}

export class CfnJsonInclude extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: CfnJsonInclude.Props) {
    super(scope, id);

    // TODO We might want to add some additional checks
    const content = fs.readFileSync(props.path).toString();
    const template = JSON.parse(content);

    new cdk.CfnInclude(this, 'include', {
      template,
    });
  }
}
