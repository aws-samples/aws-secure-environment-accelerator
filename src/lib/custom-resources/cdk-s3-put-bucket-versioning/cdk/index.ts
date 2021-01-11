import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface S3PutBucketVersioningProps {
  bucketName: string;
}

export class S3PutBucketVersioning extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: S3PutBucketVersioningProps) {
    super(scope, id);

    const { bucketName } = props;

    const physicalResourceId = custom.PhysicalResourceId.of('PutBucketVersioning');
    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::S3EnableVersioning',
      onCreate: {
        service: 'S3',
        action: 'putBucketVersioning',
        physicalResourceId: physicalResourceId,
        parameters: {
          Bucket: bucketName,
          VersioningConfiguration: {
            Status: 'Enabled',
          },
        },
      },
      onDelete: {
        service: 'S3',
        action: 'putBucketVersioning',
        physicalResourceId: physicalResourceId,
        parameters: {
          Bucket: bucketName,
          VersioningConfiguration: {
            Status: 'Suspended',
          },
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutBucketVersioning'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
