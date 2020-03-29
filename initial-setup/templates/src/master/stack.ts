import * as cdk from '@aws-cdk/core';
import * as config from '@aws-cdk/aws-config';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

export namespace MasterTemplates {
  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps = {}) {
      super(scope, id, props);

      new config.CfnConfigRule(this, 'IamPasswordPolicy', {
        source: {
          owner: 'AWS',
          sourceIdentifier: 'IAM_PASSWORD_POLICY',
        },
      });
    }
  }
}
