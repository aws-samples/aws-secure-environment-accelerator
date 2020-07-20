import hashSum from 'hash-sum';
import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';
import * as autoscaling from '@aws-cdk/aws-autoscaling';

export type LaunchConfigurationProps = autoscaling.CfnLaunchConfigurationProps;

/**
 * Wrapper around CfnLaunchConfiguration. The construct adds a hash to the launch configuration name that is based on
 * the launch configuration properties. The hash makes sure the budget gets replaced correctly by CloudFormation.
 */
export class LaunchConfiguration extends autoscaling.CfnLaunchConfiguration {
  constructor(scope: cdk.Construct, id: string, props: LaunchConfigurationProps) {
    super(scope, id, props);

    const hash = hashSum({ ...props, path: this.node.path });
    this.launchConfigurationName = props.launchConfigurationName
      ? `${props.launchConfigurationName}-${hash}`
      : undefined;

    // nachundu: I did this intentionally because when we update the image Id, the hash value is not getting changed and
    // causing failure while trying to create launch configuration. The reason is, the value of image id in props is
    // showing the token id instead of actual resolved value. So to address the issue I am passing the image id SSM path
    // to this construct and after calculating the hash, I am again trying to set the image id from SSM parameter. By
    // doing this, whenever we update the image id of the launch configuration the hash will change and we won't face
    // any launch configuration failures.

    // TODO Move this out of this class and make the hash recalculate in another way
    this.imageId = ssm.StringParameter.valueForTypedStringParameter(
      this,
      props.imageId,
      ssm.ParameterType.AWS_EC2_IMAGE_ID,
    );
  }
}
