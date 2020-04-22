import * as cdk from '@aws-cdk/core';
import { CfnMicrosoftAD } from '@aws-cdk/aws-directoryservice';
import { MadDeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Secret } from '@aws-cdk/aws-secretsmanager';

export interface ActiveDirectoryProps extends cdk.StackProps {
  madDeploymentConfig: MadDeploymentConfig;
  subnetInfo: {
    vpcId: string;
    subnetIds: string[];
  };
  password: Secret;
}

export class ActiveDirectory extends cdk.Construct {
  readonly directoryId: string;
  readonly dnsIps: string[];
  readonly outputPrefix: string;
  constructor(scope: cdk.Construct, id: string, props: ActiveDirectoryProps) {
    super(scope, id);

    const { password } = props;

    console.log('AD password ', password.secretValue.toString());
    const deployment = props.madDeploymentConfig;
    const microsoftAD = new CfnMicrosoftAD(this, 'MicrosoftAD', {
      name: deployment['dns-domain'],
      password: password.secretValue.toString(),
      vpcSettings: {
        subnetIds: props.subnetInfo.subnetIds,
        vpcId: props.subnetInfo.vpcId,
      },
      edition: deployment.size,
      shortName: deployment['netbios-domain'],
    });
    this.directoryId = microsoftAD.ref;
    this.dnsIps = microsoftAD.attrDnsIpAddresses;
    this.outputPrefix = `Mad${deployment['vpc-name']}Subnet${deployment.subnet}`;
  }
}
