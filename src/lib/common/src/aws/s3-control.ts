import * as aws from 'aws-sdk';
import * as s3control from 'aws-sdk/clients/s3control';

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
    await this.client.putPublicAccessBlock(input).promise();
  }

  /**
   * to get the s3 public access block setting at account level
   * @param input
   */
  async getPublicAccessBlock(
    input: s3control.GetPublicAccessBlockRequest,
  ): Promise<s3control.GetPublicAccessBlockOutput> {
    return this.client.getPublicAccessBlock(input).promise();
  }
}
