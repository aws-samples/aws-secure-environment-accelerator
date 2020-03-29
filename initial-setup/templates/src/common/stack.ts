import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

export namespace CommonTemplates {
  export class AssumeRoleStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps = {}) {
      super(scope, id, props);

      const roleNameParameter = new cdk.CfnParameter(this, 'RoleName');
      const assumedByRoleArnParameter = new cdk.CfnParameter(this, 'AssumedByRoleArn');

      new iam.Role(this, 'Role', {
        roleName: roleNameParameter.valueAsString,
        assumedBy: new iam.ArnPrincipal(assumedByRoleArnParameter.valueAsString),
        // TODO `inlinePolicies` should be a parameter
        //  inlinePolicies: {},
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      });
    }
  }
}
