import * as cdk from '@aws-cdk/core';
import { CfnMicrosoftAD } from '@aws-cdk/aws-directoryservice';
import { MadDeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';
import * as logs from '@aws-cdk/aws-logs';
import * as iam from '@aws-cdk/aws-iam';
import { createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { LogResourcePolicy } from '@custom-resources/logs-resource-policy';
import { DirectoryServiceLogSubscription } from '@custom-resources/ds-log-subscription';

export interface ActiveDirectoryProps extends cdk.StackProps {
  madDeploymentConfig: MadDeploymentConfig;
  subnetInfo: {
    vpcId: string;
    subnetIds: string[];
  };
  password: cdk.SecretValue;
}

export class ActiveDirectory extends cdk.Construct {
  readonly directoryId: string;
  readonly dnsIps: string[];

  constructor(scope: cdk.Construct, id: string, props: ActiveDirectoryProps) {
    super(scope, id);
    const { madDeploymentConfig, subnetInfo, password } = props;

    const logGroupName = madDeploymentConfig['log-group-name'];
    const logGroup = new logs.LogGroup(this, 'MadLogGroup', {
      logGroupName: '/aws/directoryservice/' + createName({ name: logGroupName }),
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
      logGroup,
    });
  }
}
