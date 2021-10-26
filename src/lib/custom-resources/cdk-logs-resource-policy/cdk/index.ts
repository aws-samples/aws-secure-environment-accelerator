import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface LogResourcePolicyProps {
  policyName: string;
  policyStatements?: iam.PolicyStatement[];
}

/**
 * Custom resource implementation that create logs resource policy. Awaiting
 * https://github.com/aws-cloudformation/aws-cloudformation-coverage-roadmap/issues/249
 */
export class LogResourcePolicy extends cdk.Construct {
  private readonly policyName: string;
  private readonly policyDocument: iam.PolicyDocument;

  constructor(scope: cdk.Construct, id: string, props: LogResourcePolicyProps) {
    super(scope, id);
    this.policyName = props.policyName;
    this.policyDocument = new iam.PolicyDocument({
      statements: props.policyStatements,
    });

    const physicalResourceId = custom.PhysicalResourceId.of(this.policyName);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'CloudWatchLogs',
      action: 'putResourcePolicy',
      physicalResourceId,
      parameters: {
        policyName: this.policyName,
        policyDocument: cdk.Lazy.stringValue({
          produce: () => JSON.stringify(this.policyDocument.toJSON()),
        }),
      },
    };

    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::LogResourcePolicy',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      onDelete: {
        service: 'CloudWatchLogs',
        action: 'deleteResourcePolicy',
        physicalResourceId,
        parameters: {
          policyName: this.policyName,
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['logs:PutResourcePolicy', 'logs:DeleteResourcePolicy'],
          resources: ['*'],
        }),
      ]),
    });
  }

  addStatements(...statements: iam.PolicyStatement[]) {
    this.policyDocument.addStatements(...statements);
  }
}
