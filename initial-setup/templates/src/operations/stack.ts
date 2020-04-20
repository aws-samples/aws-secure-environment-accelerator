import * as cdk from '@aws-cdk/core';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';
import { ActiveDirectory } from '../common/active-directory';

export namespace Operations {
  export interface StackProps extends cdk.StackProps {
    accountConfig: AccountConfig;
    subnetInfoOutput: string;
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      const subnetInfo = JSON.parse(JSON.stringify(props.subnetInfoOutput));
      // console.log('subnet info from shared network', subnetInfo);

      const activeDirectory = new ActiveDirectory(this, 'Microsoft AD', {
        accountConfig: props.accountConfig,
        subnetInfo: subnetInfo,
      });

      new cdk.CfnOutput(activeDirectory, 'DnsIPAddresses', {
        value: activeDirectory.dnsIpAddresses[0],
      });
    }
  }
}
