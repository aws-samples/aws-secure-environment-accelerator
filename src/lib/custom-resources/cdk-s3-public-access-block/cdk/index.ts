import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface S3PublicAccessBlockProps {
  blockPublicAcls: boolean;
  blockPublicPolicy: boolean;
  ignorePublicAcls: boolean;
  restrictPublicBuckets: boolean;
  /**
   * @default cdk.Aws.ACCOUNT_ID
   */
  accountId?: string;
}

export class S3PublicAccessBlock extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: S3PublicAccessBlockProps) {
    super(scope, id);

    const { accountId, blockPublicAcls, blockPublicPolicy, ignorePublicAcls, restrictPublicBuckets } = props;

    const physicalResourceId = custom.PhysicalResourceId.of('PutPublicAccessBlock');
    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::S3PutPublicAccessBlock',
      onCreate: {
        service: 'S3Control',
        action: 'putPublicAccessBlock',
        physicalResourceId: physicalResourceId,
        parameters: {
          AccountId: accountId ?? cdk.Aws.ACCOUNT_ID,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: blockPublicAcls,
            BlockPublicPolicy: blockPublicPolicy,
            IgnorePublicAcls: ignorePublicAcls,
            RestrictPublicBuckets: restrictPublicBuckets,
          },
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutAccountPublicAccessBlock'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
