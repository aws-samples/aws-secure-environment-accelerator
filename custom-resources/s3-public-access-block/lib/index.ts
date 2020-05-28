import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface S3PublicAccessBlockProps {
  blockPublicAccess: boolean;
}

/**
 * Custom resource implementation that creates log subscription for directory service.
 */
export class S3PublicAccessBlock extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: S3PublicAccessBlockProps) {
    super(scope, id);

    const { blockPublicAccess } = props;

    const physicalResourceId = custom.PhysicalResourceId.of('PutPublicAccessBlock');
    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::S3PutPublicAccessBlock',
      onCreate: {
        service: 'S3Control', // const service = new AWS[service](); // new AWS.S3Control
        action: 'putPublicAccessBlock', // service[action](parameters) // service.putPublicAccessBlock
        physicalResourceId: physicalResourceId,
        parameters: {
          BlockPublicAcls: blockPublicAccess,
          BlockPublicPolicy: blockPublicAccess,
          IgnorePublicAcls: blockPublicAccess,
          RestrictPublicBuckets: blockPublicAccess,
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutPublicAccessBlock'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
