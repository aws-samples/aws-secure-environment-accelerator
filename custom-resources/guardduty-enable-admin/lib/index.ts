import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface GuardDutyAdminProps {
  accountId: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyAdmin extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyAdminProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('EnableOrganizationAdminAccount');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'GuardDuty',
      action: 'enableOrganizationAdminAccount',
      physicalResourceId,
      parameters: {
        AdminAccountId: props.accountId,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::GuardDutyAdmin',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['guardduty:EnableOrganizationAdminAccount'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['organizations:*'],
          resources: ['*'],
        })
      ]),
    });
  }
}
