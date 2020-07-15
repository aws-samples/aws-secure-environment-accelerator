import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface GuardDutyCreatePublishProps {
  detectorId: string;
  destinationArn: string;
  kmsKeyArn: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyCreatePublish extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyCreatePublishProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('CreatePublishingDestination');
    const onCreate: custom.AwsSdkCall = {
      service: 'GuardDuty',
      action: 'createPublishingDestination',
      physicalResourceId,
      parameters: {
        DestinationType: 'S3',
        DetectorId: props.detectorId,
        DestinationProperties: {
          DestinationArn: props.destinationArn,
          KmsKeyArn: props.kmsKeyArn,
        },
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::GuardDutyCreatePublish',
      onCreate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['guardduty:createPublishingDestination'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            's3:CreateBucket',
            's3:GetBucketLocation',
            's3:ListAllMyBuckets',
            's3:PutBucketAcl',
            's3:PutBucketPublicAccessBlock',
            's3:PutBucketPolicy',
            's3:PutObject',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['kms:ListAliases'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
