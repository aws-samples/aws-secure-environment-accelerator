import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

const resourceType = 'Custom::VpcDefaultSecurityGroup';

export interface VpcDefaultSecurityGroupProps {
  vpcId: string;
  acceleratorName: string;
}

/**
 * Custom resource implementation that delete inbound and outbound rules of default security group
 */
export class VpcDefaultSecurityGroup extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: VpcDefaultSecurityGroupProps) {
    super(scope, id);

    const lambdaPath = require.resolve('@custom-resources/vpc-default-security-group-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: [
            'ec2:DescribeSecurityGroups',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupEgress',
            'ec2:CreateTags',
          ],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        vpcId: props.vpcId,
        acceleratorName: props.acceleratorName,
      },
    });
  }
}
