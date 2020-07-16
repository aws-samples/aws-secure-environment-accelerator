import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface GuardDutyDestinationProps {
  detectorId: string;
}

/**
 * Custom resource implementation that retrive Guardduty destination
 */
export class GuardDutyDestination extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyDestinationProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('ListDetectors');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'GuardDuty',
      action: 'listPublishingDestinations',
      physicalResourceId,
      parameters: {
        DetectorId: props.detectorId,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::DestinationId',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['guardduty:ListPublishingDestinations'],
          resources: ['*'],
        }),
      ]),
    });
  }

  get destinationId(): string {
    // as of today only one destination is allowed for guard duty
    return this.resource.getResponseField(`Destinations.0.DestinationId`);
  }

  get destinationType(): string {
    return this.resource.getResponseField(`Destinations.0.DestinationType`);
  }

  get status(): string {
    return this.resource.getResponseField(`Destinations.0.Status`);
  }
}
