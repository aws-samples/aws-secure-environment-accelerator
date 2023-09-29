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

import { CustomResource, Stack, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

const resourceType = 'Custom::OpenSearchSiemConfigure';

export interface OpenSearchSiemConfigureProps {
  openSearchDomain: string;
  adminRoleMappingArn: string;
  osProcesserRoleArn: string;
  openSearchConfigurationS3Bucket: string;
  openSearchConfigurationS3Key: string;
  lambdaExecutionRole: string;
  vpcId: string;
  domainSubnetIds: string[];
  securityGroupIds: string[];
  siemVersion: string;
}

export type OpenSearchSiemRuntimeProps = Omit<
  OpenSearchSiemConfigureProps,
  'lambdaExecutionRole' | 'vpcId' | 'availablityZones' | 'domainSubnetIds' | 'securityGroupIds'
>;

/**
 * Custom resource that will configure S3 Bucket Notifications
 */
export class OpenSearchSiemConfigure extends Construct {
  private readonly resource: CustomResource;

  constructor(scope: Construct, id: string, private readonly props: OpenSearchSiemConfigureProps) {
    super(scope, id);

    const runtimeProps: OpenSearchSiemRuntimeProps = props;

    this.resource = new CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...runtimeProps,
      },
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const cdkVpc = ec2.Vpc.fromVpcAttributes(stack, 'ConfigureVPCLookupAttr', {
      vpcId: this.props.vpcId,
      availabilityZones: this.props.domainSubnetIds, // required, but not used.
      privateSubnetIds: this.props.domainSubnetIds,
    });

    const vpcSecurityGroups = [];

    for (const sgId of this.props.securityGroupIds) {
      const tmp = ec2.SecurityGroup.fromSecurityGroupId(
        stack,
        `ConfigureSecurityGroupLookup-${vpcSecurityGroups.length}`,
        sgId,
      );
      vpcSecurityGroups.push(tmp);
    }

    const lambdaRole = iam.Role.fromRoleArn(stack, `ConfigureLambdaRole`, this.props.lambdaExecutionRole, {
      mutable: true,
    });

    return new lambda.Function(stack, `ConfigureLambda`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('lambdas/siem-config/dist'),
      role: lambdaRole,
      handler: 'index.handler',
      timeout: Duration.minutes(15),
      memorySize: 2048,
      vpc: cdkVpc,
      vpcSubnets: {
        subnetFilters: [ec2.SubnetFilter.byIds(this.props.domainSubnetIds)],
      },
      securityGroups: vpcSecurityGroups,
      environment: {
        SIEM_VERSION: this.props.siemVersion,
      },
    });
  }
}
