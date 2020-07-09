import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface MacieUpdateConfigProps {
  autoEnable: boolean;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class MacieUpdateConfig extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieUpdateConfigProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('UpdateOrganizationConfiguration');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Macie2',
      action: 'updateOrganizationConfiguration',
      physicalResourceId,
      parameters: {
        autoEnable: props.autoEnable,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::MacieUpdateConfig',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['macie2:UpdateOrganizationConfiguration'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
