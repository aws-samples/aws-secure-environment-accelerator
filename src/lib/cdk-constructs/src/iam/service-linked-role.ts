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
