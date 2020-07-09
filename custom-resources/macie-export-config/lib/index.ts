import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface MacieUpdateExportConfigProps {
  bucketName: string;
  kmsKeyArn: string;
  keyPrefix?: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class MacieUpdateExportConfig extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieUpdateExportConfigProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('PutClassificationExportConfiguration');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Macie2',
      action: 'putClassificationExportConfiguration',
      physicalResourceId,
      parameters: {
        s3Destination: props
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::MacieUpdateExportConfig',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['macie2:putClassificationExportConfiguration'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['s3:*'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['kms:*'],
          resources: ['*'],
        })
      ]),
    });
  }
}
