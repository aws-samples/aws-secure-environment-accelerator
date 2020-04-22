import * as cdk from '@aws-cdk/core';
import { ActiveDirectory, ActiveDirectoryProps } from '../common/active-directory';

export namespace Operations {
  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: ActiveDirectoryProps) {
      super(scope, id, props);
      const activeDirectory = new ActiveDirectory(this, 'Microsoft AD', props);
      new cdk.CfnOutput(this, `${activeDirectory.outputPrefix}Id`, {
        value: activeDirectory.directoryId,
      });
      new cdk.CfnOutput(this, `${activeDirectory.outputPrefix}DnsIps`, {
        value: cdk.Fn.join(',', activeDirectory.dnsIps),
      });
    }
  }
}
