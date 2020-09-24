import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

const resourceType = 'Custom::SSMIncreaseThroughput';

export interface SsmIncreaseThroughputProps {
  roleArn: string;
}

/**
 * Custom resource implementation that create logs resource policy. Awaiting
 * https://github.com/aws-cloudformation/aws-cloudformation-coverage-roadmap/issues/249
 */
export class SsmIncreaseThroughput extends cdk.Construct {
  private role: iam.IRole;
  constructor(scope: cdk.Construct, id: string, props: SsmIncreaseThroughputProps) {
    super(scope, id);

    this.role = iam.Role.fromRoleArn(this, `${resourceType}Role`, props.roleArn);

    const physicalResourceId = custom.PhysicalResourceId.of('SSMParameterStoreIncreaseThroughput');

    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'SSM',
      action: 'updateServiceSetting',
      physicalResourceId,
      parameters: {
        SettingId: '/ssm/parameter-store/high-throughput-enabled',
        SettingValue: 'true',
      },
    };

    const onDelete: custom.AwsSdkCall = {
      service: 'SSM',
      action: 'updateServiceSetting',
      physicalResourceId,
      parameters: {
        SettingId: '/ssm/parameter-store/high-throughput-enabled',
        SettingValue: 'false',
      },
    };

    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: resourceType,
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      onDelete: onDelete,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ssm:UpdateServiceSetting', 'ssm:ResetServiceSetting'],
          resources: [
            `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:servicesetting/ssm/parameter-store/high-throughput-enabled`,
          ],
        }),
      ]),
      role: this.role,
    });
  }
}
