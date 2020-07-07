import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface MacieEnableAdminProps {
  accountId: string;
  clientToken?: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class MacieEnableAdmin extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieEnableAdminProps) {
    super(scope, id);
    const { accountId, clientToken } = props;

    const physicalResourceId = custom.PhysicalResourceId.of('EnableOrganizationAdminAccount');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Macie2',
      action: 'enableOrganizationAdminAccount',
      physicalResourceId,
      parameters: {
        adminAccountId: accountId,
        clientToken,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::MacieEnableAdmin',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['macie2:EnableOrganizationAdminAccount'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
