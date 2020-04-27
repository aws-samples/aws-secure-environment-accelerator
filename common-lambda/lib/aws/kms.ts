import * as aws from 'aws-sdk';
import { CreateKeyRequest, CreateKeyResponse, CreateAliasRequest } from 'aws-sdk/clients/kms';

export class KMS {
  private readonly client: aws.KMS;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.KMS({
      credentials,
    });
  }

  /**
   * to create KMS key
   * @param params
   */
  async createKey(params: CreateKeyRequest): Promise<CreateKeyResponse> {
    return this.client.createKey(params).promise();
  }

  /**
   * to create alias for a kms key
   * @param aliasName
   * @param targetKeyId
   */
  async createAlias(aliasName: string, targetKeyId: string): Promise<void> {
    const params: CreateAliasRequest = {
      AliasName: aliasName,
      TargetKeyId: targetKeyId,
    };
    await this.client.createAlias(params).promise();
  }
}
