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

import aws from 'aws-sdk';

import {
  DescribeSubnetsCommandInput,
  DescribeSubnetsCommandOutput,
  EC2,
  EnableEbsEncryptionByDefaultCommandInput,
  EnableEbsEncryptionByDefaultCommandOutput,
  InternetGateway,
  ModifyEbsDefaultKmsKeyIdCommandInput,
  ModifyEbsDefaultKmsKeyIdCommandOutput,
  Subnet,
  Vpc,
} from '@aws-sdk/client-ec2';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';
import { collectAsync } from '../util/generator';

export class EC2 {
  private readonly client: EC2;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new EC2({
      region,
      credentials,
      logger: console,
    });
  }

  /**
   * to enable EBS encryption by default
   * @param dryRun
   */
  async enableEbsEncryptionByDefault(dryRun: boolean): Promise<EnableEbsEncryptionByDefaultCommandOutput> {
    const params: EnableEbsEncryptionByDefaultCommandInput = {
      DryRun: dryRun,
    };
    return throttlingBackOff(() => this.client.enableEbsEncryptionByDefault(params).promise());
  }

  /**
   * to set default kms key for EBS encryption
   * @param kmsKeyId
   * @param dryRun
   */
  async modifyEbsDefaultKmsKeyId(kmsKeyId: string, dryRun: boolean): Promise<ModifyEbsDefaultKmsKeyIdCommandOutput> {
    const params: ModifyEbsDefaultKmsKeyIdCommandInput = {
      KmsKeyId: kmsKeyId,
      DryRun: dryRun,
    };
    return throttlingBackOff(() => this.client.modifyEbsDefaultKmsKeyId(params).promise());
  }

  /**
   * to get all VPCs
   */
  async describeDefaultVpcs(): Promise<Array<Vpc> | undefined> {
    const vpcs = await throttlingBackOff(() =>
      this.client
        .describeVpcs({
          Filters: [
            {
              Name: 'isDefault',
              Values: ['true'],
            },
          ],
        })
        .promise(),
    );
    return vpcs.Vpcs;
  }

  /**
   * to delete Subnet
   */
  async deleteSubnet(subnetId: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .deleteSubnet({
          SubnetId: subnetId,
        })
        .promise(),
    );
  }

  /**
   * to delete VPC
   */
  async deleteVpc(vpcId: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .deleteVpc({
          VpcId: vpcId,
        })
        .promise(),
    );
  }

  /**
   * to describe Internet Gateways
   */
  async describeInternetGatewaysByVpc(vpcIds: string[]): Promise<Array<InternetGateway> | undefined> {
    const igws = await throttlingBackOff(() =>
      this.client
        .describeInternetGateways({
          Filters: [
            {
              Name: 'attachment.vpc-id',
              Values: vpcIds,
            },
          ],
        })
        .promise(),
    );
    return igws.InternetGateways;
  }

  /**
   * to detach VPC from Internet Gateway
   */
  async detachInternetGateway(vpcId: string, igwId: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .detachInternetGateway({
          InternetGatewayId: igwId,
          VpcId: vpcId,
        })
        .promise(),
    );
  }

  /**
   * to delete Internet Gateway
   */
  async deleteInternetGateway(igwId: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .deleteInternetGateway({
          InternetGatewayId: igwId,
        })
        .promise(),
    );
  }

  /**
   * Wrapper around AWS.EC2.describeSubnets.
   */
  async listSubnets(input: DescribeSubnetsCommandInput): Promise<Array<Subnet>> {
    return listWithNextToken<DescribeSubnetsRequest, DescribeSubnetsResult, Subnet>(
      this.client.describeSubnets.bind(this.client),
      r => r.Subnets!,
      input,
    );
  }
}
