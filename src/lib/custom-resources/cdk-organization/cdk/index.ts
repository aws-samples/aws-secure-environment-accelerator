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
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

/**
 * Custom resource implementation that retrive Organization Ids
 */
export class Organizations extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of('DescribeOrganization');
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Organizations',
      action: 'describeOrganization',
      region: 'us-east-1', // us-east-1 is the only endpoint available
      physicalResourceId,
      parameters: {},
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::Organizations',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['organizations:DescribeOrganization'],
          resources: ['*'],
        }),
      ]),
    });
  }

  get organizationId(): string {
    return this.resource.getResponseField('Organization.Id');
  }

  get organizationArn(): string {
    return this.resource.getResponseField('Organization.Arn');
  }

  get masterAccountArn(): string {
    return this.resource.getResponseField('Organization.MasterAccountArn');
  }

  get masterAccountEmail(): string {
    return this.resource.getResponseField('Organization.MasterAccountEmail');
  }
}
