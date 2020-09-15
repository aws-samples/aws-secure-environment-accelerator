import hashSum from 'hash-sum';
import * as cdk from '@aws-cdk/core';
import * as autoscaling from '@aws-cdk/aws-autoscaling';

export type LaunchConfigurationProps = autoscaling.CfnLaunchConfigurationProps;

/**
 * Added to update the hash for Rsyslog UserData properties
 */
interface LaunchConfigurationCustomProps extends LaunchConfigurationProps {
  centralBucketName?: string;
  logGroupName?: string;
}

/**
 * Wrapper around CfnLaunchConfiguration. The construct adds a hash to the launch configuration name that is based on
 * the launch configuration properties. The hash makes sure the budget gets replaced correctly by CloudFormation.
 */
export class LaunchConfiguration extends autoscaling.CfnLaunchConfiguration {
  constructor(scope: cdk.Construct, id: string, props: LaunchConfigurationCustomProps) {
    super(scope, id, props);

    const hash = hashSum({ ...props, path: this.node.path });
    this.launchConfigurationName = props.launchConfigurationName
      ? `${props.launchConfigurationName}-${hash}`
      : undefined;
  }
}
