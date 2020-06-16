import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface GuardDutyUpdateConfigProps {
  autoEnable: boolean;
  detectorId: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyUpdateConfig extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyUpdateConfigProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('UpdateOrganizationConfiguration');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'GuardDuty',
      action: 'updateOrganizationConfiguration',
      physicalResourceId,
      parameters: {
        AutoEnable: props.autoEnable,
        DetectorId: props.detectorId,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::GuardDutyUpdateConfig',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['guardduty:UpdateOrganizationConfiguration'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
