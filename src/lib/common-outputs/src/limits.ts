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

export enum Limit {
  Ec2Eips = 'Amazon EC2/Number of EIPs',
  VpcPerRegion = 'Amazon VPC/VPCs per Region',
  VpcInterfaceEndpointsPerVpc = 'Amazon VPC/Interface VPC endpoints per VPC',
  CloudFormationStackCount = 'AWS CloudFormation/Stack count',
  CloudFormationStackSetPerAdmin = 'AWS CloudFormation/Stack sets per administrator account',
  OrganizationsMaximumAccounts = 'AWS Organizations/Maximum accounts',
}

export interface LimitOutput {
  accountKey: string;
  limitKey: string;
  serviceCode: string;
  quotaCode: string;
  value: number;
  region: string;
}
