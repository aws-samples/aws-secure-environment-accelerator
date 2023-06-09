/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { LaunchConfiguration } from '@aws-accelerator/cdk-constructs/src/autoscaling';
import { MadDeploymentConfig } from '@aws-accelerator/common-config/src';
import { CfnAutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { pascalCase } from 'pascal-case';
import { SecurityGroup } from './security-group';
import { createIamInstanceProfileName } from './iam-assets';
import { AcceleratorStack } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { trimSpecialCharacters } from '@aws-accelerator/common-outputs/src/secrets';
import { Construct } from 'constructs';

export interface ADUsersAndGroupsProps extends cdk.StackProps {
  madDeploymentConfig: MadDeploymentConfig;
  latestRdgwAmiId: string;
  vpcId: string;
  vpcName: string;
  keyPairName: string;
  subnetIds: string[];
  adminPasswordArn: string;
  s3BucketName: string;
  s3KeyPrefix: string;
  stackId: string;
  accountNames: string[];
  userSecrets: UserSecret[];
  accountKey: string;
  serviceLinkedRoleArn: string;
  installerVersion: string;
}

export interface UserSecret {
  user: string;
  passwordSecretArn: string;
}

export class ADUsersAndGroups extends Construct {
  constructor(scope: Construct, id: string, props: ADUsersAndGroupsProps) {
    super(scope, id);

    const {
      latestRdgwAmiId,
      vpcId,
      vpcName,
      keyPairName,
      subnetIds,
      madDeploymentConfig,
      s3BucketName,
      s3KeyPrefix,
      stackId,
      stackName,
      adminPasswordArn,
      accountNames,
      userSecrets,
      accountKey,
      serviceLinkedRoleArn,
      installerVersion,
    } = props;

    // Creating AD Users command
    const adUsersCommand: string[] = madDeploymentConfig['ad-users'].map(
      adUser =>
        `C:\\cfn\\scripts\\AD-user-setup.ps1 -UserName ${adUser.user} -Password ((Get-SECSecretValue -SecretId ${
          userSecrets.find(x => x.user === adUser.user)?.passwordSecretArn
        }).SecretString) -DomainAdminUser ${
          madDeploymentConfig['netbios-domain']
        }\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString) -PasswordNeverExpires Yes -UserEmailAddress ${
          adUser.email
        }`,
    );

    // Below script to set admin password to never expire
    adUsersCommand.push(
      `C:\\cfn\\scripts\\AD-user-setup.ps1 -UserName admin -Password ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString) -DomainAdminUser ${madDeploymentConfig['netbios-domain']}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString) -PasswordNeverExpires Yes`,
    );

    // Creating AD Groups command
    const configGroups = madDeploymentConfig['ad-groups']
      .concat(madDeploymentConfig['ad-per-account-groups'])
      .concat(madDeploymentConfig['adc-group']);
    // console.log("configGroups", configGroups);
    const adGroups = prepareGroups(configGroups, accountNames);
    // console.log("All groups", adGroups);

    // Mapping Users to Groups command
    const adUserGroups: { user: string; groups: string[] }[] = [];
    madDeploymentConfig['ad-users'].map(a => {
      const groups = prepareGroups(a.groups, accountNames);
      adUserGroups.push({ user: a.user, groups });
    });
    // console.log("adUserGroups", adUserGroups);

    const adUserGroupsCommand: string[] = [];
    adUserGroups.map(userGroup =>
      adUserGroupsCommand.push(
        `C:\\cfn\\scripts\\AD-user-group-setup.ps1 -GroupNames \'${userGroup.groups.join(',')}\' -UserName ${
          userGroup.user
        } -DomainAdminUser ${
          madDeploymentConfig['netbios-domain']
        }\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString)`,
      ),
    );

    // creating security group for the instance
    const securityGroup = new SecurityGroup(this, 'RdgwSecurityGroup', {
      securityGroups: madDeploymentConfig['security-groups'],
      accountKey,
      vpcId,
      vpcName,
      installerVersion,
    });

    const stack = AcceleratorStack.of(this);
    const prefix = trimSpecialCharacters(stack.acceleratorPrefix);
    const launchTemplate = new cdk.aws_ec2.CfnLaunchTemplate(this, 'RDGWLaunchTemplate', {
      launchTemplateName: `${prefix}-RDGWLaunchTemplate`,
      launchTemplateData: {
        blockDeviceMappings: [
          {
            deviceName: '/dev/sda1',
            ebs: {
              volumeSize: 50,
              volumeType: 'gp2',
              encrypted: true,
            },
          },
        ],
        // securityGroupIds: [securityGroup.securityGroups[0].id],
        imageId: latestRdgwAmiId,
        iamInstanceProfile: {
          name: createIamInstanceProfileName(madDeploymentConfig['rdgw-instance-role']),
        },
        networkInterfaces: [
          {
            deviceIndex: 0,
            associatePublicIpAddress: false,

            groups: [securityGroup.securityGroups[0].id],
          },
        ],
        instanceType: madDeploymentConfig['rdgw-instance-type'],
        keyName: keyPairName,
        metadataOptions: {
          httpTokens: 'required',
          httpEndpoint: 'enabled',
        },
      },
    });

    const launchConfig = new LaunchConfiguration(this, 'RDGWLaunchConfiguration', {
      launchConfigurationName: `${prefix}-RDGWLaunchConfiguration`,
      metadataOptions: madDeploymentConfig['rdgw-enforce-imdsv2']
        ? { httpEndpoint: 'enabled', httpTokens: 'required' }
        : undefined,
      associatePublicIpAddress: false,
      imageId: latestRdgwAmiId,
      securityGroups: [securityGroup.securityGroups[0].id],
      iamInstanceProfile: createIamInstanceProfileName(madDeploymentConfig['rdgw-instance-role']),
      instanceType: madDeploymentConfig['rdgw-instance-type'],
      blockDeviceMappings: [
        {
          deviceName: '/dev/sda1',
          ebs: {
            volumeSize: 50,
            volumeType: 'gp2',
            encrypted: true,
          },
        },
      ],
      keyName: keyPairName,
    });

    const autoScalingGroupSize = madDeploymentConfig['num-rdgw-hosts'];
    const autoscalingGroup = new CfnAutoScalingGroup(this, 'RDGWAutoScalingGroupB', {
      autoScalingGroupName: `${prefix}-RDGWAutoScalingGroup`,
      // launchConfigurationName: launchConfig.ref,
      launchTemplate: {
        version: '1',
        launchTemplateId: launchTemplate.ref,
      },
      vpcZoneIdentifier: subnetIds,
      maxInstanceLifetime: madDeploymentConfig['rdgw-max-instance-age'] * 86400,
      minSize: `${madDeploymentConfig['min-rdgw-hosts']}`,
      maxSize: `${madDeploymentConfig['max-rdgw-hosts']}`,
      cooldown: '300',
      desiredCapacity: `${autoScalingGroupSize}`,
      serviceLinkedRoleArn,
      tags: [
        {
          key: 'Name',
          value: `${stack.acceleratorPrefix}RDGW`,
          propagateAtLaunch: true,
        },
      ],
    });

    autoscalingGroup.cfnOptions.creationPolicy = {
      resourceSignal: {
        count: autoScalingGroupSize,
        timeout: 'PT30M',
      },
    };

    launchTemplate.addPropertyOverride(
      'LaunchTemplateData.UserData',
      cdk.Fn.base64(
        `<script>\n cfn-init.exe -v -c config -s ${stackId} -r ${launchTemplate.logicalId} --region ${cdk.Aws.REGION} \n # Signal the status from cfn-init\n cfn-signal -e $? --stack ${props.stackName} --resource ${autoscalingGroup.logicalId} --region ${cdk.Aws.REGION}\n </script>\n`,
      ),
    );

    launchTemplate.addOverride('Metadata.AWS::CloudFormation::Init', {
      configSets: {
        config: ['setup', 'join', 'installRDS', 'createADConnectorUser', 'configurePasswordPolicy', 'finalize'],
      },
      setup: {
        files: {
          'c:\\cfn\\cfn-hup.conf': {
            content: `[main]\n stack=${stackName}\n region=${cdk.Aws.REGION}\n`,
          },
          'c:\\cfn\\hooks.d\\cfn-auto-reloader.conf': {
            content: `[cfn-auto-reloader-hook]\n triggers=post.update\n path=Resources.${launchTemplate.logicalId}.Metadata.AWS::CloudFormation::Init\n action=cfn-init.exe -v -c config -s ${stackId} -r ${launchTemplate.logicalId} --region ${cdk.Aws.REGION}\n`,
          },
          'C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules\\AWSQuickStart\\AWSQuickStart.psm1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AWSQuickStart.psm1`,
            authentication: 'S3AccessCreds',
          },
          'C:\\cfn\\scripts\\Join-Domain.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}Join-Domain.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\Initialize-RDGW.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}Initialize-RDGW.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-user-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-user-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-group-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-group-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-user-group-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-user-group-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-group-grant-permissions-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-group-grant-permissions-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-connector-permissions-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-connector-permissions-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\Configure-password-policy.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}Configure-password-policy.ps1`,
            authentication: 'S3AccessCreds',
          },
        },
        services: {
          windows: {
            'cfn-hup': {
              enabled: 'true',
              ensureRunning: 'true',
              files: ['c:\\cfn\\cfn-hup.conf', 'c:\\cfn\\hooks.d\\cfn-auto-reloader.conf'],
            },
          },
        },
        commands: {
          'a-set-execution-policy': {
            command: 'powershell.exe -Command "Set-ExecutionPolicy RemoteSigned -Force"',
            waitAfterCompletion: '0',
          },
          'b-init-quickstart-module': {
            command: `powershell.exe -Command "New-AWSQuickStartResourceSignal -Stack ${props.stackName}  -Resource ${autoscalingGroup.logicalId} -Region ${cdk.Aws.REGION}"`,
            waitAfterCompletion: '0',
          },
        },
      },
      join: {
        commands: {
          'a-join-domain': {
            command: `powershell.exe -Command "C:\\cfn\\scripts\\Join-Domain.ps1 -DomainName ${madDeploymentConfig['dns-domain']} -UserName ${madDeploymentConfig['netbios-domain']}\\admin -Password ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString)"`,
            waitAfterCompletion: 'forever',
          },
        },
      },
      installRDS: {
        commands: {
          'a-install-rds': {
            command: 'powershell.exe -Command "Install-WindowsFeature RDS-Gateway,RSAT-RDS-Gateway,RSAT-AD-Tools"',
            waitAfterCompletion: '0',
          },
          'b-configure-rdgw': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\Initialize-RDGW.ps1 -ServerFQDN $($env:COMPUTERNAME + '.${madDeploymentConfig['dns-domain']}') -DomainNetBiosName ${madDeploymentConfig['netbios-domain']} -GroupName 'domain admins'`,
            waitAfterCompletion: '0',
          },
        },
      },
      createADConnectorUser: {
        commands: {
          'a-create-ad-users': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned ${adUsersCommand.join('; ')}`,
            waitAfterCompletion: '0',
          },
          'b-create-ad-groups': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\AD-group-setup.ps1 -GroupNames \'${adGroups.join(
              ',',
            )}\' -DomainAdminUser ${
              madDeploymentConfig['netbios-domain']
            }\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString)`,
            waitAfterCompletion: '0',
          },
          'c-configure-ad-users-groups': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned ${adUserGroupsCommand.join('; ')}`,
            waitAfterCompletion: '0',
          },
          'd-configure-ad-group-permissions': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\AD-connector-permissions-setup.ps1 -GroupName ${madDeploymentConfig['adc-group']} -DomainAdminUser ${madDeploymentConfig['netbios-domain']}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString)`,
            waitAfterCompletion: '0',
          },
        },
      },
      configurePasswordPolicy: {
        commands: {
          'a-set-password-policy': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\Configure-password-policy.ps1 -DomainAdminUser admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString) -ComplexityEnabled:$${pascalCase(
              String(madDeploymentConfig['password-policies'].complexity),
            )} -LockoutDuration 00:${
              madDeploymentConfig['password-policies']['lockout-duration']
            }:00 -LockoutObservationWindow 00:${
              madDeploymentConfig['password-policies']['lockout-attempts-reset']
            }:00 -LockoutThreshold ${madDeploymentConfig['password-policies']['failed-attempts']} -MaxPasswordAge:${
              madDeploymentConfig['password-policies']['max-age']
            }.00:00:00 -MinPasswordAge:${
              madDeploymentConfig['password-policies']['min-age']
            }.00:00:00 -MinPasswordLength:${
              madDeploymentConfig['password-policies']['min-len']
            } -PasswordHistoryCount:${madDeploymentConfig['password-policies'].history} -ReversibleEncryptionEnabled:$${
              madDeploymentConfig['password-policies'].reversible
            }`,
            waitAfterCompletion: '0',
          },
        },
      },
      finalize: {
        commands: {
          '1-signal-success': {
            command: 'powershell.exe -Command "Write-AWSQuickStartStatus"',
            waitAfterCompletion: '0',
          },
        },
      },
    });

    launchTemplate.addOverride('Metadata.AWS::CloudFormation::Authentication', {
      S3AccessCreds: {
        type: 'S3',
        roleName: madDeploymentConfig['rdgw-instance-role'],
        buckets: [s3BucketName],
      },
    });

    launchConfig.addOverride('Metadata.AWS::CloudFormation::Authentication', {
      S3AccessCreds: {
        type: 'S3',
        roleName: madDeploymentConfig['rdgw-instance-role'],
        buckets: [s3BucketName],
      },
    });

    launchConfig.userData = cdk.Fn.base64(
      `<script>\n cfn-init.exe -v -c config -s ${stackId} -r ${launchConfig.logicalId} --region ${cdk.Aws.REGION} \n # Signal the status from cfn-init\n cfn-signal -e $? --stack ${props.stackName} --resource ${autoscalingGroup.logicalId} --region ${cdk.Aws.REGION}\n </script>\n`,
    );
    launchConfig.addOverride('Metadata.AWS::CloudFormation::Init', {
      configSets: {
        config: ['setup', 'join', 'installRDS', 'createADConnectorUser', 'configurePasswordPolicy', 'finalize'],
      },
      setup: {
        files: {
          'c:\\cfn\\cfn-hup.conf': {
            content: `[main]\n stack=${stackName}\n region=${cdk.Aws.REGION}\n`,
          },
          'c:\\cfn\\hooks.d\\cfn-auto-reloader.conf': {
            content: `[cfn-auto-reloader-hook]\n triggers=post.update\n path=Resources.${launchConfig.logicalId}.Metadata.AWS::CloudFormation::Init\n action=cfn-init.exe -v -c config -s ${stackId} -r ${launchConfig.logicalId} --region ${cdk.Aws.REGION}\n`,
          },
          'C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules\\AWSQuickStart\\AWSQuickStart.psm1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AWSQuickStart.psm1`,
            authentication: 'S3AccessCreds',
          },
          'C:\\cfn\\scripts\\Join-Domain.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}Join-Domain.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\Initialize-RDGW.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}Initialize-RDGW.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-user-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-user-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-group-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-group-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-user-group-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-user-group-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-group-grant-permissions-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-group-grant-permissions-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\AD-connector-permissions-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-connector-permissions-setup.ps1`,
            authentication: 'S3AccessCreds',
          },
          'c:\\cfn\\scripts\\Configure-password-policy.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}Configure-password-policy.ps1`,
            authentication: 'S3AccessCreds',
          },
        },
        services: {
          windows: {
            'cfn-hup': {
              enabled: 'true',
              ensureRunning: 'true',
              files: ['c:\\cfn\\cfn-hup.conf', 'c:\\cfn\\hooks.d\\cfn-auto-reloader.conf'],
            },
          },
        },
        commands: {
          'a-set-execution-policy': {
            command: 'powershell.exe -Command "Set-ExecutionPolicy RemoteSigned -Force"',
            waitAfterCompletion: '0',
          },
          'b-init-quickstart-module': {
            command: `powershell.exe -Command "New-AWSQuickStartResourceSignal -Stack ${props.stackName}  -Resource ${autoscalingGroup.logicalId} -Region ${cdk.Aws.REGION}"`,
            waitAfterCompletion: '0',
          },
        },
      },
      join: {
        commands: {
          'a-join-domain': {
            command: `powershell.exe -Command "C:\\cfn\\scripts\\Join-Domain.ps1 -DomainName ${madDeploymentConfig['dns-domain']} -UserName ${madDeploymentConfig['netbios-domain']}\\admin -Password ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString)"`,
            waitAfterCompletion: 'forever',
          },
        },
      },
      installRDS: {
        commands: {
          'a-install-rds': {
            command: 'powershell.exe -Command "Install-WindowsFeature RDS-Gateway,RSAT-RDS-Gateway,RSAT-AD-Tools"',
            waitAfterCompletion: '0',
          },
          'b-configure-rdgw': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\Initialize-RDGW.ps1 -ServerFQDN $($env:COMPUTERNAME + '.${madDeploymentConfig['dns-domain']}') -DomainNetBiosName ${madDeploymentConfig['netbios-domain']} -GroupName 'domain admins'`,
            waitAfterCompletion: '0',
          },
        },
      },
      createADConnectorUser: {
        commands: {
          'a-create-ad-users': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned ${adUsersCommand.join('; ')}`,
            waitAfterCompletion: '0',
          },
          'b-create-ad-groups': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\AD-group-setup.ps1 -GroupNames \'${adGroups.join(
              ',',
            )}\' -DomainAdminUser ${
              madDeploymentConfig['netbios-domain']
            }\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString)`,
            waitAfterCompletion: '0',
          },
          'c-configure-ad-users-groups': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned ${adUserGroupsCommand.join('; ')}`,
            waitAfterCompletion: '0',
          },
          'd-configure-ad-group-permissions': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\AD-connector-permissions-setup.ps1 -GroupName ${madDeploymentConfig['adc-group']} -DomainAdminUser ${madDeploymentConfig['netbios-domain']}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString)`,
            waitAfterCompletion: '0',
          },
        },
      },
      configurePasswordPolicy: {
        commands: {
          'a-set-password-policy': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\Configure-password-policy.ps1 -DomainAdminUser admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPasswordArn}).SecretString) -ComplexityEnabled:$${pascalCase(
              String(madDeploymentConfig['password-policies'].complexity),
            )} -LockoutDuration 00:${
              madDeploymentConfig['password-policies']['lockout-duration']
            }:00 -LockoutObservationWindow 00:${
              madDeploymentConfig['password-policies']['lockout-attempts-reset']
            }:00 -LockoutThreshold ${madDeploymentConfig['password-policies']['failed-attempts']} -MaxPasswordAge:${
              madDeploymentConfig['password-policies']['max-age']
            }.00:00:00 -MinPasswordAge:${
              madDeploymentConfig['password-policies']['min-age']
            }.00:00:00 -MinPasswordLength:${
              madDeploymentConfig['password-policies']['min-len']
            } -PasswordHistoryCount:${madDeploymentConfig['password-policies'].history} -ReversibleEncryptionEnabled:$${
              madDeploymentConfig['password-policies'].reversible
            }`,
            waitAfterCompletion: '0',
          },
        },
      },
      finalize: {
        commands: {
          '1-signal-success': {
            command: 'powershell.exe -Command "Write-AWSQuickStartStatus"',
            waitAfterCompletion: '0',
          },
        },
      },
    });
  }
}

function prepareGroups(configGroups: string[], accounts: string[]): string[] {
  const groups: string[] = [];
  configGroups.map(a => {
    if (a.startsWith('*')) {
      Object.values(accounts).map(b => groups.push(`aws-${b}${a.substring(1)}`));
    } else {
      groups.push(a);
    }
  });
  return groups;
}
