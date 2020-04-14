import * as aws from 'aws-sdk';
import * as s3 from 'aws-sdk/clients/s3';

export class S3 {
  private readonly client: aws.S3;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.S3({
      credentials,
    });
  }

  async getObjectBody(input: s3.GetObjectRequest): Promise<s3.Body> {
    const object = await this.client.getObject(input).promise();
    return object.Body!;
  }

  async getObjectBodyAsString(input: s3.GetObjectRequest): Promise<string> {
    return this.getObjectBody(input).then(body => body.toString());
  }

  async putObject(input: s3.PutObjectRequest): Promise<s3.PutObjectOutput> {
    return this.client.putObject(input).promise();
  }
}
