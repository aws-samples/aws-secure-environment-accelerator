import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface GuardDutyUpdatePublishProps {
  destinationId: string;
  detectorId: string;
  destinationArn: string;
  kmsKeyArn: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyUpdatePublish extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyUpdatePublishProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('UpdatePublishingDestination');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'GuardDuty',
      action: 'updatePublishingDestination',
      physicalResourceId,
      parameters: {
        DestinationId: props.destinationId,
        DetectorId: props.detectorId,
        DestinationProperties: {
          DestinationArn: props.destinationArn,
          KmsKeyArn: props.kmsKeyArn,
        }
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::GuardDutyUpdatePublish',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['guardduty:updatePublishingDestination'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
