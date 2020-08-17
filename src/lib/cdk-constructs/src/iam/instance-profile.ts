import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

export interface IInstanceProfile extends cdk.IConstruct {
  readonly instanceProfileName: string;
}

export interface InstanceProfileProps {
  instanceProfileName: string;
  roles: iam.IRole[];
  path: string;
}

export class InstanceProfile extends cdk.Construct implements IInstanceProfile {
  readonly instanceProfileName: string;

  constructor(scope: cdk.Construct, id: string, private readonly props: InstanceProfileProps) {
    super(scope, id);

    const resource = new iam.CfnInstanceProfile(this, 'Resource', {
      path: props.path,
      roles: props.roles.map(role => role.roleName),
      instanceProfileName: props.instanceProfileName,
    });

    this.instanceProfileName = resource.ref;
  }

  static fromInstanceRoleName(scope: cdk.Construct, id: string, props: ImportedInstanceProfileProps) {
    return new ImportedInstanceProfile(scope, id, props);
  }
}

export interface ImportedInstanceProfileProps {
  instanceProfileName: string;
}

class ImportedInstanceProfile extends cdk.Construct implements IInstanceProfile {
  readonly instanceProfileName = this.props.instanceProfileName;

  constructor(scope: cdk.Construct, id: string, private readonly props: ImportedInstanceProfileProps) {
    super(scope, id);
  }
}
