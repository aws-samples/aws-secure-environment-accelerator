import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class GuardDutyDetector extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('ListDetectors');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'GuardDuty',
      action: 'listDetectors',
      physicalResourceId,
      parameters: {},
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::DetectorIds',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['guardduty:ListDetectors'],
          resources: ['*'],
        }),
      ]),
    });
  }

  get detectorId(): string {
    // based on https://docs.aws.amazon.com/guardduty/latest/APIReference/API_CreateDetector.html
    // you can only have one detector per account per region, so this should always be one result.
    return this.resource.getResponseField(`DetectorIds.0`);
  }
}
