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

export interface EC2DisableApiTerminationProps {
  ec2Name: string;
  ec2Id: string;
}

/**
 * Custom resource implementation that Enables/Disables Deletion Protection on EC instances.
 */
export class EC2DisableApiTermination extends cdk.Construct {
  private readonly ec2Id: string;
  private readonly ec2Name: string;

  constructor(scope: cdk.Construct, id: string, props: EC2DisableApiTerminationProps) {
    super(scope, id);
    this.ec2Id = props.ec2Id;
    this.ec2Name = props.ec2Name;

    const physicalResourceId = custom.PhysicalResourceId.of(`${this.ec2Name}-DeletionProtection`);

    const onCreateOrUpdate = this.createDisableApiTerminationDefinition(physicalResourceId, true);
    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::EC2DisableApiTermination',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      onDelete: this.createDisableApiTerminationDefinition(physicalResourceId, false),
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ec2:ModifyInstanceAttribute'],
          resources: ['*'],
        }),
      ]),
    });
  }

  private createDisableApiTerminationDefinition(
    physicalResourceId: custom.PhysicalResourceId,
    disableApiTermination: boolean,
  ): custom.AwsSdkCall {
    return {
      service: 'EC2',
      action: 'modifyInstanceAttribute',
      physicalResourceId,
      parameters: {
        InstanceId: this.ec2Id,
        DisableApiTermination: {
          Value: disableApiTermination,
        },
      },
    };
  }
}
