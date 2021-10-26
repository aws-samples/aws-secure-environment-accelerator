import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

export type ServiceLinkedRoleProps = iam.CfnServiceLinkedRoleProps;

export class ServiceLinkedRole extends cdk.Construct {
  private readonly resource: iam.CfnServiceLinkedRole;

  constructor(scope: cdk.Construct, id: string, props: ServiceLinkedRoleProps) {
    super(scope, id);

    this.resource = new iam.CfnServiceLinkedRole(this, 'Resource', props);
  }

  get roleArn(): string {
    return `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/aws-service-role/${this.resource.awsServiceName}/${this.resource.ref}`;
  }
}
