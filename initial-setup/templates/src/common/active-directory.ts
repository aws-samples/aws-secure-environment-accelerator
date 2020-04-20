import * as cdk from '@aws-cdk/core';
import { CfnMicrosoftAD } from '@aws-cdk/aws-directoryservice';
import { AccountConfig } from '@aws-pbmm/common-lambda/lib/config';

export interface ActiveDirectoryProps extends cdk.StackProps {
  accountConfig: AccountConfig;
  subnetInfo: {
    vpcId: string;
    subnetIds: string[];
    vpcName: string;
    subnetName: string;
  };
}

export class ActiveDirectory extends cdk.Construct {
  readonly dnsIpAddresses: string[] = [];
  constructor(scope: cdk.Construct, id: string, props: ActiveDirectoryProps) {
    super(scope, id);
    const deployment = props.accountConfig.deployments.mad;
    if (
      deployment?.deploy &&
      deployment['vpc-name'] === props.subnetInfo.vpcName &&
      deployment.subnet === props.subnetInfo.subnetName
    ) {
      const microsoftAD = new CfnMicrosoftAD(this, 'MicrosoftAD', {
        name: deployment['dns-domain'],
        password: 'Test1234', //TODO get password from secret's manager
        vpcSettings: {
          subnetIds: props.subnetInfo.subnetIds,
          vpcId: props.subnetInfo.vpcId,
        },
        createAlias: true,
        edition: deployment.size,
        shortName: deployment['netbios-domain'],
        enableSso: true,
      });
      this.dnsIpAddresses = microsoftAD.attrDnsIpAddresses;
    }
  }
}
