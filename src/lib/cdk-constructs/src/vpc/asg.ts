import * as cdk from '@aws-cdk/core';
import { LaunchConfiguration } from '../../src/autoscaling';
import { CfnAutoScalingGroup } from '@aws-cdk/aws-autoscaling';

export interface RsysLogAutoScalingGroupProps extends cdk.StackProps {
  latestRsyslogAmiId: string;
  subnetIds: string[];
  serviceLinkedRoleArn: string;
  acceleratorPrefix: string;
  securityGroupId: string;
  logGroupName: string;
  targetGroupArn: string;
  centralBucketName: string;
  instanceRole: string;
  instanceType: string;
  rootVolumeSize: number;
  desiredInstanceHosts: number;
  minInstanceHosts: number;
  maxInstanceHosts: number;
  maxInstanceAge: number;
}

export class RsysLogAutoScalingGroup extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: RsysLogAutoScalingGroupProps) {
    super(scope, id);

    const launchConfig = new LaunchConfiguration(this, 'RsyslogLaunchConfiguration', {
      launchConfigurationName: `${props.acceleratorPrefix}RsyslogLaunchConfiguration`,
      associatePublicIpAddress: false,
      imageId: props.latestRsyslogAmiId,
      securityGroups: [props.securityGroupId],
      iamInstanceProfile: createIamInstanceProfileName(props.instanceRole),
      instanceType: props.instanceType,
      blockDeviceMappings: [
        {
          deviceName: '/dev/xvda',
          ebs: {
            volumeSize: props.rootVolumeSize,
            volumeType: 'gp2',
            encrypted: true,
          },
        },
      ],
      centralBucketName: props.centralBucketName,
      logGroupName: props.logGroupName,
    });

    const autoScalingGroupSize = props.desiredInstanceHosts;
    new CfnAutoScalingGroup(this, 'RsyslogAutoScalingGroup', {
      autoScalingGroupName: `${props.acceleratorPrefix}RsyslogAutoScalingGroup`,
      launchConfigurationName: launchConfig.ref,
      vpcZoneIdentifier: props.subnetIds,
      maxInstanceLifetime: props.maxInstanceAge * 86400,
      minSize: `${props.minInstanceHosts}`,
      maxSize: `${props.maxInstanceHosts}`,
      desiredCapacity: `${autoScalingGroupSize}`,
      serviceLinkedRoleArn: props.serviceLinkedRoleArn,
      targetGroupArns: [props.targetGroupArn],
      healthCheckType: 'ELB',
      healthCheckGracePeriod: 300,
      tags: [
        {
          key: 'Name',
          value: `${props.acceleratorPrefix}rsyslog`,
          propagateAtLaunch: true,
        },
      ],
    });

    launchConfig.userData = cdk.Fn.base64(
      `#!/bin/bash\necho "[v8-stable]\nname=Adiscon CentOS-6 - local packages for \\$basearch\nbaseurl=http://rpms.adiscon.com/v8-stable/epel-6/\\$basearch\nenabled=0\ngpgcheck=0\ngpgkey=http://rpms.adiscon.com/RPM-GPG-KEY-Adiscon\nprotect=1" >> /etc/yum.repos.d/rsyslog.repo\nyum update -y\nyum install -y rsyslog --enablerepo=v8-stable --setopt=v8-stable.priority=1\nchkconfig rsyslog on\naws s3 cp s3://${props.centralBucketName}/rsyslog/rsyslog.conf /etc/rsyslog.conf\nservice rsyslog restart\nwget https://s3.${cdk.Aws.REGION}.amazonaws.com/amazoncloudwatch-agent-${cdk.Aws.REGION}/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm\nrpm -U ./amazon-cloudwatch-agent.rpm\ninstanceid=$(curl http://169.254.169.254/latest/meta-data/instance-id)\necho "{\\"logs\\": {\\"logs_collected\\": {\\"files\\": {\\"collect_list\\": [{\\"file_path\\": \\"/var/log/messages\\",\\"log_group_name\\": \\"${props.logGroupName}\\",\\"log_stream_name\\": \\"$instanceid\\"}]}}}}" >> /opt/aws/amazon-cloudwatch-agent/bin/config.json\n/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -s -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json`,
    );
  }
}

function createIamInstanceProfileName(iamRoleName: string) {
  return `${iamRoleName}-ip`;
}
