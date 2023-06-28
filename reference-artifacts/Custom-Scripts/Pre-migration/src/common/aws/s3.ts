import * as s3 from 'aws-sdk/clients/s3';
import aws from './aws-client';
import { throttlingBackOff } from './backoff';

export class S3 {
  private readonly client: aws.S3;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.S3({
      credentials,
      region,
    });
  }

  async objectExists(input: s3.HeadObjectRequest): Promise<boolean> {
    try {
      await this.client.headObject(input).promise();
      return true;
    } catch (err) {
      return false;
    }
  }
  async getObjectBody(input: s3.GetObjectRequest): Promise<s3.Body> {
    const object = await throttlingBackOff(() => this.client.getObject(input).promise());
    return object.Body!;
  }

  async getObjectBodyAsString(input: s3.GetObjectRequest): Promise<string> {
    return this.getObjectBody(input).then(body => body.toString());
  }
}
