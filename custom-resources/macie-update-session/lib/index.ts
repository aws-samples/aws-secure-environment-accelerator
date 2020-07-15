import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';
import { MacieFrequency, MacieStatus } from '@custom-resources/macie-enable-lambda';

export interface MacieUpdateSessionProps {
  findingPublishingFrequency: MacieFrequency;
  status: MacieStatus;
}
/**
 * Custom resource implementation that turn on auto enable for Macie
 */
export class MacieUpdateSession extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieUpdateSessionProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('UpdateMacieSession');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Macie2',
      action: 'updateMacieSession',
      physicalResourceId,
      parameters: {
        findingPublishingFrequency: props.findingPublishingFrequency,
        status: props.status,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::MacieUpdateSession',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['macie2:UpdateMacieSession'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
