import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface AccountDetail {
  accountId: string;
  email: string;
}

export interface GuardDutyCreateMemberProps {
  accountDetails: AccountDetail[];
  detectorId: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyCreateMember extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyCreateMemberProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('CreateMembers');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'GuardDuty',
      action: 'createMembers',
      physicalResourceId,
      parameters: {
        AccountDetails: props.accountDetails,
        DetectorId: props.detectorId,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::GuardDutyCreateMember',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['guardduty:CreateMembers'],
          resources: ['*'],
        }),
      ]),
    });
  }

  get unprocessedAccounts() {
    return this.resource.getResponseField('UnprocessedAccounts');
  }
}
