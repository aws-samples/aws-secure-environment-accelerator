import * as aws from 'aws-sdk';
import {
  EnableEbsEncryptionByDefaultRequest,
  EnableEbsEncryptionByDefaultResult,
  ModifyEbsDefaultKmsKeyIdRequest,
  ModifyEbsDefaultKmsKeyIdResult,
  SubnetList,
  VpcList,
} from 'aws-sdk/clients/ec2';
import * as ec2 from 'aws-sdk/clients/ec2';
import { throttlingBackOff } from './backoff';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';
import { collectAsync } from '../util/generator';

export class EC2 {
  private readonly client: aws.EC2;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.EC2({
      credentials,
    });
  }

  /**
   * to enable EBS encryption by default
   * @param dryRun
   */
  async enableEbsEncryptionByDefault(dryRun: boolean): Promise<EnableEbsEncryptionByDefaultResult> {
    const params: EnableEbsEncryptionByDefaultRequest = {
      DryRun: dryRun,
    };
    return this.client.enableEbsEncryptionByDefault(params).promise();
  }

  /**
   * to set default kms key for EBS encryption
   * @param kmsKeyId
   * @param dryRun
   */
  async modifyEbsDefaultKmsKeyId(kmsKeyId: string, dryRun: boolean): Promise<ModifyEbsDefaultKmsKeyIdResult> {
    const params: ModifyEbsDefaultKmsKeyIdRequest = {
      KmsKeyId: kmsKeyId,
      DryRun: dryRun,
    };
    return this.client.modifyEbsDefaultKmsKeyId(params).promise();
  }

  /**
   * to get all VPCs
   */
  async describeDefaultVpcs(): Promise<VpcList | undefined> {
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
  async describeInternetGatewaysByVpc(vpcIds: string[]): Promise<ec2.InternetGatewayList | undefined> {
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
  async listSubnets(input: ec2.DescribeSubnetsRequest): Promise<ec2.SubnetList> {
    return listWithNextToken<ec2.DescribeSubnetsRequest, ec2.DescribeSubnetsResult, ec2.Subnet>(
      this.client.describeSubnets.bind(this.client),
      r => r.Subnets!,
      input,
    );
  }
}
