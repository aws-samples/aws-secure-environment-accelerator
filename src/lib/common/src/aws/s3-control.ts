import aws from './aws-client';
import * as s3control from 'aws-sdk/clients/s3control';
import { throttlingBackOff } from './backoff';

export class S3Control {
  private readonly client: aws.S3Control;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.S3Control({
      credentials,
    });
  }

  /**
   * to put the s3 public access block setting at account level
   * @param input
   */
  async putPublicAccessBlock(input: s3control.PutPublicAccessBlockRequest): Promise<void> {
    await throttlingBackOff(() => this.client.putPublicAccessBlock(input).promise());
  }

  /**
   * to get the s3 public access block setting at account level
   * @param input
   */
  async getPublicAccessBlock(
    input: s3control.GetPublicAccessBlockRequest,
  ): Promise<s3control.GetPublicAccessBlockOutput> {
    return throttlingBackOff(() => this.client.getPublicAccessBlock(input).promise());
  }
}
