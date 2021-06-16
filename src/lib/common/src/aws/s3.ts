import aws from './aws-client';
import * as s3 from 'aws-sdk/clients/s3';
import { throttlingBackOff } from './backoff';

export class S3 {
  private readonly client: aws.S3;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.S3({
      credentials,
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

  async putObject(input: s3.PutObjectRequest): Promise<s3.PutObjectOutput> {
    return throttlingBackOff(() => this.client.putObject(input).promise());
  }

  async deleteObject(input: s3.DeleteObjectRequest): Promise<s3.DeleteObjectOutput> {
    return throttlingBackOff(() => this.client.deleteObject(input).promise());
  }

  async putBucketKmsEncryption(bucket: string, kmsMasterKeyId: string): Promise<void> {
    const params: s3.PutBucketEncryptionRequest = {
      Bucket: bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
              KMSMasterKeyID: kmsMasterKeyId,
            },
          },
        ],
      },
    };

    await throttlingBackOff(() => this.client.putBucketEncryption(params).promise());
  }
}
