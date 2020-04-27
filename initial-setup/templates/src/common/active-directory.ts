import * as cdk from '@aws-cdk/core';
import { CfnMicrosoftAD } from '@aws-cdk/aws-directoryservice';
import { MadDeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import * as logs from '@aws-cdk/aws-logs';
import * as iam from '@aws-cdk/aws-iam';

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

  constructor(scope: cdk.Construct, id: string, props: ActiveDirectoryProps) {
    super(scope, id);
    const { madDeploymentConfig, subnetInfo, password } = props;

    const createLogGroup = new logs.LogGroup(this, 'MadLogGroup', {
      logGroupName: `/aws/directoryservice/${madDeploymentConfig['log-group-name']}`,
    });

    const servicePrincipal = new iam.ServicePrincipal('ds.amazonaws.com');
    createLogGroup.grant(servicePrincipal, 'logs:PutLogEvents', 'logs:CreateLogStream');

    const microsoftAD = new CfnMicrosoftAD(this, 'MicrosoftAD', {
      name: madDeploymentConfig['dns-domain'],
      password: password.secretValue.toString(),
      vpcSettings: {
        subnetIds: subnetInfo.subnetIds,
        vpcId: subnetInfo.vpcId,
      },
      edition: madDeploymentConfig.size,
      shortName: madDeploymentConfig['netbios-domain'],
    });
    this.directoryId = microsoftAD.ref;
    this.dnsIps = microsoftAD.attrDnsIpAddresses;
  }
}
