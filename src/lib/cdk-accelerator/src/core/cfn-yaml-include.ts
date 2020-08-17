import * as cdk from '@aws-cdk/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export namespace CfnYamlInclude {
  export interface Props {
    path: string;
  }
}

export class CfnYamlInclude extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: CfnYamlInclude.Props) {
    super(scope, id);

    // TODO We might want to add some additional checks
    const content = fs.readFileSync(props.path).toString();
    const template = yaml.load(content);

    new cdk.CfnInclude(this, 'include', {
      template,
    });
  }
}
