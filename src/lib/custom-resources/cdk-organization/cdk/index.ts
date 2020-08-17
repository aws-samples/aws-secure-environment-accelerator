import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

/**
 * Custom resource implementation that retrive Organization Ids
 */
export class Organizations extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('DescribeOrganization');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Organizations',
      action: 'describeOrganization',
      region: 'us-east-1', // us-east-1 is the only endpoint available
      physicalResourceId,
      parameters: {},
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::Organizations',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['organizations:DescribeOrganization'],
          resources: ['*'],
        }),
      ]),
    });
  }

  get organizationId(): string {
    return this.resource.getResponseField('Organization.Id');
  }

  get organizationArn(): string {
    return this.resource.getResponseField('Organization.Arn');
  }

  get masterAccountArn(): string {
    return this.resource.getResponseField('Organization.MasterAccountArn');
  }

  get masterAccountEmail(): string {
    return this.resource.getResponseField('Organization.MasterAccountEmail');
  }
}
