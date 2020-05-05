import * as cdk from '@aws-cdk/core';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import * as iam from '@aws-cdk/aws-iam';
import { MadDeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';
import { CfnAutoScalingGroup, CfnLaunchConfiguration, AutoScalingGroup } from '@aws-cdk/aws-autoscaling';
import { pascalCase } from 'pascal-case';

export interface ADUsersAndGroupsProps extends cdk.StackProps {
  madDeploymentConfig: MadDeploymentConfig;
  latestRdgwAmiId: string;
  domainMemberSGID: string;
  keyPairName: string;
  subnetIds: string[];
  adminPassword: Secret;
  s3BucketName: string;
  s3KeyPrefix: string;
  stackId: string;
}

export class ADUsersAndGroups extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ADUsersAndGroupsProps) {
    super(scope, id);

    const {
      latestRdgwAmiId,
      domainMemberSGID,
      keyPairName,
      subnetIds,
      madDeploymentConfig,
      s3BucketName,
      s3KeyPrefix,
      stackId,
      stackName,
      adminPassword,
    } = props;

    const RDGWHostRole = new iam.Role(this, 'RDGWHostRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          'EC2RoleforSSM',
          'arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM',
        ),
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          'SSMAutomationRole',
          'arn:aws:iam::aws:policy/service-role/AmazonSSMAutomationRole',
        ),
      ],
    });

    RDGWHostRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: ['*'],
      }),
    );

    RDGWHostRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:AssociateAddress', 'ec2:DescribeAddresses'],
        resources: ['*'],
      }),
    );

    RDGWHostRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:Get*'],
        resources: ['*'],
      }),
    );

    RDGWHostRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: ['*'],
      }),
    );

    const RDGWHostProfile = new iam.CfnInstanceProfile(this, 'RDGWHostProfile', {
      roles: [RDGWHostRole.roleName],
      instanceProfileName: 'PBMM-RDGWHostProfile',
    });

    const launchConfig = new CfnLaunchConfiguration(this, 'PBMMRDGWLaunchConfiguration', {
      associatePublicIpAddress: true, // TODO make it false
      imageId: latestRdgwAmiId,
      securityGroups: [domainMemberSGID],
      iamInstanceProfile: RDGWHostProfile.instanceProfileName,
      instanceType: madDeploymentConfig['rdgw-instance-type'],
      launchConfigurationName: 'PBMMRDGWLaunchConfiguration',
      blockDeviceMappings: [
        {
          deviceName: '/dev/sda1',
          ebs: {
            volumeSize: 50,
            volumeType: 'gp2',
          },
        },
      ],
      keyName: keyPairName,
    });

    const autoscalingGroup = new CfnAutoScalingGroup(this, 'RDGWAutoScalingGroupB', {
      launchConfigurationName: launchConfig.launchConfigurationName,
      vpcZoneIdentifier: subnetIds,
      minSize: madDeploymentConfig['num-rdgw-hosts'].toString(),
      maxSize: madDeploymentConfig['num-rdgw-hosts'].toString(),
      cooldown: '300',
      desiredCapacity: madDeploymentConfig['num-rdgw-hosts'].toString(),
      autoScalingGroupName: 'PBMMRDGWAutoScalingGroup',
    });

    autoscalingGroup.cfnOptions.creationPolicy = {
      resourceSignal: {
        count: madDeploymentConfig['num-rdgw-hosts'],
        timeout: 'PT30M',
      },
    };

    autoscalingGroup.addDependsOn(launchConfig);

    launchConfig.addOverride('Metadata.AWS::CloudFormation::Authentication', {
      S3AccessCreds: {
        type: 'S3',
        roleName: RDGWHostRole.roleName,
        buckets: [s3BucketName],
      },
    });

    launchConfig.userData = cdk.Fn.base64(
      `<script>\ncfn-init.exe -v -c config -s ${stackId} -r ${launchConfig.logicalId} --region ${cdk.Aws.REGION} \n # Signal the status from cfn-init\n cfn-signal -e $? --stack ${props.stackName} --resource ${autoscalingGroup.logicalId} --region ${cdk.Aws.REGION}\n </script>\n`,
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
          'c:\\cfn\\scripts\\AD-connector-setup.ps1': {
            source: `https://${s3BucketName}.s3.${cdk.Aws.REGION}.amazonaws.com/${s3KeyPrefix}AD-connector-setup.ps1`,
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
            command: `powershell.exe -Command "C:\\cfn\\scripts\\Join-Domain.ps1 -DomainName ${madDeploymentConfig['dns-domain']} -UserName ${madDeploymentConfig['netbios-domain']}\\admin -Password ((Get-SECSecretValue -SecretId ${adminPassword.secretArn}).SecretString)"`,
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
          'a-configure-ad-connector-user': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\AD-connector-setup.ps1 -GroupName ${madDeploymentConfig["adc-group"]} -UserName aduser -Password Test@12345 -DomainAdminUser ${madDeploymentConfig["netbios-domain"]}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPassword.secretArn}).SecretString) -PasswordNeverExpires Yes`,
            waitAfterCompletion: '0',
          }
        }
      },
      configurePasswordPolicy: {
        commands: {
          'a-set-password-policy': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\Configure-password-policy.ps1 -DomainAdminUser admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${adminPassword.secretArn}).SecretString) -ComplexityEnabled:$${pascalCase(String(madDeploymentConfig["password-policies"].complexity))} -LockoutDuration 00:${madDeploymentConfig["password-policies"]["lockout-duration"]}:00 -MaxPasswordAge:${madDeploymentConfig["password-policies"]["max-age"]}.00:00:00 -MinPasswordAge:${madDeploymentConfig["password-policies"]["min-age"]}.00:00:00 -MinPasswordLength:${madDeploymentConfig["password-policies"]["min-len"]} -PasswordHistoryCount:${madDeploymentConfig["password-policies"].history} -ReversibleEncryptionEnabled:$${madDeploymentConfig["password-policies"].reversible}`,
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
