import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface FlowLogContainerProps {
  bucket: s3.IBucket;
  vpcNames: string[];
}

/**
 * Auxiliary construct that keeps allows us to create a single flow log bucket per account.
 */
export class FlowLogContainer extends cdk.Construct {
  readonly bucket: s3.IBucket;
  readonly role: iam.Role;

  constructor(scope: cdk.Construct, id: string, props: FlowLogContainerProps) {
    super(scope, id);

    this.bucket = props.bucket;
    this.role = new iam.Role(this, 'Role', {
      roleName: createRoleName('VPC-FlowLog'),
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    this.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogDelivery',
          'logs:DeleteLogDelivery',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
        ],
        resources: ['*'],
      }),
    );

    if (props.vpcNames.length !== 0) {
      const destinations = props.vpcNames.map(v => `${this.bucket.bucketArn}/${cdk.Aws.ACCOUNT_ID}/${v}`);
      // Give the role access to the flow log bucket
      this.role.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['s3:*'],
          resources: [this.bucket.bucketArn, ...destinations],
        }),
      );
    }
  }
}
