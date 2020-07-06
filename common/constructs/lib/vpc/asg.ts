import * as cdk from '@aws-cdk/core';
import { LaunchConfiguration } from '../../../constructs/lib/autoscaling';
import { createIamInstanceProfileName } from '../../../../initial-setup/templates/src/common/iam-assets';
import { RsyslogConfig } from '../../../../common-lambda/lib/config';
import { CfnAutoScalingGroup } from '@aws-cdk/aws-autoscaling';

export interface RsysLogAutoScalingGroupProps extends cdk.StackProps {
  latestRsyslogAmiId: string;
  subnetIds: string[];
  stackId: string;
  serviceLinkedRoleArn: string;
  acceleratorPrefix: string;
  securityGroupId: string;
  rsyslogConfig: RsyslogConfig;
  logGroupName: string;
  targetGroupArn: string;
}

export class RsysLogAutoScalingGroup extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: RsysLogAutoScalingGroupProps) {
    super(scope, id);

    const {
      latestRsyslogAmiId,
      stackId,
      rsyslogConfig,
      subnetIds,
      serviceLinkedRoleArn,
      acceleratorPrefix,
      securityGroupId,
      logGroupName,
      targetGroupArn,
    } = props;

    const launchConfig = new LaunchConfiguration(this, 'RsyslogLaunchConfiguration', {
      launchConfigurationName: `${acceleratorPrefix}-RsyslogLaunchConfiguration`,
      associatePublicIpAddress: true, //TODO
      imageId: latestRsyslogAmiId,
      securityGroups: [securityGroupId],
      iamInstanceProfile: createIamInstanceProfileName(rsyslogConfig['rsyslog-instance-role']),
      instanceType: rsyslogConfig['rsyslog-instance-type'],
      blockDeviceMappings: [
        {
          deviceName: '/dev/sda1',
          ebs: {
            volumeSize: rsyslogConfig['rsyslog-root-volume-size'],
            volumeType: 'gp2',
            encrypted: true,
          },
        },
      ],
    });

    const autoScalingGroupSize = rsyslogConfig['desired-rsyslog-hosts'];
    const autoscalingGroup = new CfnAutoScalingGroup(this, 'RsyslogAutoScalingGroupB', {
      autoScalingGroupName: `${acceleratorPrefix}-RsyslogAutoScalingGroup`,
      launchConfigurationName: launchConfig.ref,
      vpcZoneIdentifier: subnetIds,
      maxInstanceLifetime: rsyslogConfig['rsyslog-max-instance-age'] * 86400,
      minSize: `${rsyslogConfig['min-rsyslog-hosts']}`,
      maxSize: `${rsyslogConfig['max-rsyslog-hosts']}`,
      desiredCapacity: `${autoScalingGroupSize}`,
      serviceLinkedRoleArn,
      targetGroupArns: [targetGroupArn],
      healthCheckType: 'ELB',
      healthCheckGracePeriod: 300,
      tags: [
        {
          key: 'Name',
          value: `${acceleratorPrefix}rsyslog`,
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

    launchConfig.userData = cdk.Fn.base64(
      `#!/bin/bash\necho "[v8-stable]\nname=Adiscon CentOS-6 - local packages for \\$basearch\nbaseurl=http://rpms.adiscon.com/v8-stable/epel-6/\\$basearch\nenabled=0\ngpgcheck=0\ngpgkey=http://rpms.adiscon.com/RPM-GPG-KEY-Adiscon\nprotect=1" >> /etc/yum.repos.d/rsyslog.repo\nyum update -y\nyum install -y rsyslog --enablerepo=v8-stable --setopt=v8-stable.priority=1\nchkconfig rsyslog on\nsystemctl restart rsyslog\nwget https://s3.${cdk.Aws.REGION}.amazonaws.com/amazoncloudwatch-agent-${cdk.Aws.REGION}/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm\nrpm -U ./amazon-cloudwatch-agent.rpm\necho "{\\"logs\\": {\\"logs_collected\\": {\\"files\\": {\\"collect_list\\": [{\\"file_path\\": \\"/var/log/messages\\",\\"log_group_name\\": \\"${logGroupName}\\",\\"log_stream_name\\": \\"instance-id\\"}]}}}}" >> /opt/aws/amazon-cloudwatch-agent/bin/config.json\n/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -s -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json`,
    );
  }
}
