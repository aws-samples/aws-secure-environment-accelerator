/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
