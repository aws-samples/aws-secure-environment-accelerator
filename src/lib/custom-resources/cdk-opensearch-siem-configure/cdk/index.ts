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

import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as ec2 from '@aws-cdk/aws-ec2';

const resourceType = 'Custom::OpenSearchSiemConfigure';

export interface OpenSearchSiemConfigureProps {
  openSearchDomain: string;
  adminRoleMappingArn: string;
  adminOpenSearchRoleArn: string;
  osProcesserRoleArn: string;
  openSearchConfigurationS3Bucket: string;
  openSearchConfigurationS3Key: string;
  lambdaExecutionRole: string;
  vpcId: string;
  availablityZones: string[];
  domainSubnetIds: string[];
  securityGroupIds: string[];
  stsDns: string[];
}

export type OpenSearchSiemRuntimeProps = Omit<
  OpenSearchSiemConfigureProps,
  'lambdaExecutionRole' | 'vpcId' | 'availablityZones' | 'domainSubnetIds' | 'securityGroupIds'
>;

/**
 * Custom resource that will configure S3 Bucket Notifications
 */
export class OpenSearchSiemConfigure extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, private readonly props: OpenSearchSiemConfigureProps) {
    super(scope, id);

    const runtimeProps: OpenSearchSiemRuntimeProps = props;

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...runtimeProps,
      },
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-opensearch-siem-configure-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const cdkVpc = ec2.Vpc.fromVpcAttributes(stack, 'OpenSearchConfigureVPCLookupAttr', {
      vpcId: this.props.vpcId,
      availabilityZones: this.props.availablityZones,
      privateSubnetIds: this.props.domainSubnetIds,
    });

    const vpc_sg = [];

    for (const sgId of this.props.securityGroupIds) {
      const tmp = ec2.SecurityGroup.fromSecurityGroupId(
        stack,
        `OpenSearchConfigureSecurityGroupLookup-${vpc_sg.length}`,
        sgId,
      );
      vpc_sg.push(tmp);
    }

    const lambdaRole = iam.Role.fromRoleArn(
      stack,
      `OpenSearchSiemConfigureLambdaRole`,
      this.props.lambdaExecutionRole,
      {
        mutable: true,
      },
    );

    return new lambda.Function(stack, `OpenSearchSiemConfigure`, {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(lambdaDir),
      role: lambdaRole,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      vpc: cdkVpc,
      vpcSubnets: {
        subnetFilters: [ec2.SubnetFilter.byIds(this.props.domainSubnetIds)],
      },
      securityGroups: vpc_sg,
      environment: {
        OPEN_SEARCH_ADMIN_ROLE_ARN: this.props.adminOpenSearchRoleArn,
      },
    });
  }
}
