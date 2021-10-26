import * as cdk from '@aws-cdk/core';
import { CfnMicrosoftAD } from '@aws-cdk/aws-directoryservice';
import { MadDeploymentConfig } from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import { LogResourcePolicy } from '@aws-accelerator/custom-resource-logs-resource-policy';
import { DirectoryServiceLogSubscription } from '@aws-accelerator/custom-resource-ds-log-subscription';

export interface ActiveDirectoryProps extends cdk.StackProps {
  madDeploymentConfig: MadDeploymentConfig;
  subnetInfo: {
    vpcId: string;
    subnetIds: string[];
  };
  password: cdk.SecretValue;
  roleArn: string;
}

export class ActiveDirectory extends cdk.Construct {
  readonly directoryId: string;
  readonly dnsIps: string[];

  constructor(scope: cdk.Construct, id: string, props: ActiveDirectoryProps) {
    super(scope, id);
    const { madDeploymentConfig, subnetInfo, password, roleArn } = props;

    const logGroupName = madDeploymentConfig['log-group-name'];

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName,
      roleArn,
    });

    // Allow directory services to write to the log group
    new LogResourcePolicy(this, 'MadLogGroupPolicy', {
      policyName: 'DSLogSubscription',
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          principals: [new iam.ServicePrincipal('ds.amazonaws.com')],
          resources: [logGroup.logGroupArn],
        }),
      ],
    });

    const microsoftAD = new CfnMicrosoftAD(this, 'MicrosoftAD', {
      name: madDeploymentConfig['dns-domain'],
      password: password.toString(),
      vpcSettings: {
        subnetIds: subnetInfo.subnetIds,
        vpcId: subnetInfo.vpcId,
      },
      edition: madDeploymentConfig.size,
      shortName: madDeploymentConfig['netbios-domain'],
    });
    this.directoryId = microsoftAD.ref;
    this.dnsIps = microsoftAD.attrDnsIpAddresses;

    // Subscribe directory service to log group
    new DirectoryServiceLogSubscription(this, 'MadLogSubscription', {
      directory: microsoftAD,
      logGroup: logGroup.logGroupName,
    });
  }
}
