import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface MacieCreateMemberProps {
  accountId: string;
  email: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class MacieCreateMember extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieCreateMemberProps) {
    super(scope, id);
    const { accountId, email } = props;

    const physicalResourceId = custom.PhysicalResourceId.of('EnableOrganizationAdminAccount');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Macie2',
      action: 'createMember',
      physicalResourceId,
      parameters: {
        account: {
          accountId,
          email,
        }
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::MacieCreateMember',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['macie2:CreateMember'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
