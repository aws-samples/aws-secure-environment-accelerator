import * as aws from 'aws-sdk';
import {
  EnableEbsEncryptionByDefaultRequest,
  EnableEbsEncryptionByDefaultResult,
  ModifyEbsDefaultKmsKeyIdRequest,
  ModifyEbsDefaultKmsKeyIdResult,
} from 'aws-sdk/clients/ec2';

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
}
