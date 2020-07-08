import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export enum MacieFrequency {
  FIFTEEN_MINUTES = 'FIFTEEN_MINUTES',
  ONE_HOUR = 'ONE_HOUR',
  SIX_HOURS = 'SIX_HOURS',
}

export enum MacieStatus {
  ENABLED = 'ENABLED',
  PAUSED = 'PAUSED',
}

export interface MacieEnableProps {
  findingPublishingFrequency: MacieFrequency;
  status: MacieStatus;
  clientToken?: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class MacieEnable extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieEnableProps) {
    super(scope, id);
    const { findingPublishingFrequency, status, clientToken } = props;

    const physicalResourceId = custom.PhysicalResourceId.of('EnableMacie');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Macie2',
      action: 'enableMacie',
      physicalResourceId,
      parameters: {
        clientToken,
        findingPublishingFrequency,
        status,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::MacieEnable',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['macie2:EnableMacie'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
