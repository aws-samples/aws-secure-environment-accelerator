/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { S3Client, GetObjectCommand, GetObjectCommandInput } from '@aws-sdk/client-s3';
import * as s3 from 'aws-sdk/clients/s3';
import aws from './aws-client';
import { throttlingBackOff } from './backoff';

export class S3 {
  public readonly client: aws.S3;
  private readonly clientV3: S3Client;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.S3({
      credentials,
      region,
    });

    this.clientV3 = new S3Client({ credentials, region });
  }

  async objectExists(input: s3.HeadObjectRequest): Promise<boolean> {
    try {
      await throttlingBackOff(() => this.client.headObject(input).promise());
      return true;
    } catch (err) {
      return false;
    }
  }
  async getObjectBody(input: s3.GetObjectRequest): Promise<s3.Body> {
    const object = await throttlingBackOff(() => this.client.getObject(input).promise());
    return object.Body!;
  }

  async getObjectBodyV3(input: GetObjectCommandInput) {
    const object = await throttlingBackOff(() => this.clientV3.send(new GetObjectCommand(input)));
    return object.Body!;
  }
  async getObjectBodyAsString(input: s3.GetObjectRequest): Promise<string> {
    return throttlingBackOff(() => this.getObjectBody(input).then((body) => body.toString()));
  }

  async getBucketPolicy(input: s3.GetBucketPolicyRequest) {
    const response = await throttlingBackOff(() => this.client.getBucketPolicy(input).promise());
    return JSON.parse(response.Policy ?? '{"Version": "2012-10-17", "Statement": []}');
  }

  async putObject(input: s3.PutObjectRequest): Promise<s3.PutObjectOutput> {
    return throttlingBackOff(() => this.client.putObject(input).promise());
  }

  async copyObject(sourceBucket: string, sourceKey: string, destinationBucket: string, destinationPrefix?: string) {
    await throttlingBackOff(() =>
      this.client
        .copyObject({
          Bucket: destinationBucket,
          CopySource: `${sourceBucket}/${sourceKey}`,
          Key: destinationPrefix ? `${destinationPrefix}/${sourceKey}` : sourceKey,
        })
        .promise(),
    );
  }

  presignedUrl(props: { command: string; Bucket: string; Key: string }) {
    const signedUrlExpireSeconds = 60 * 5;
    return this.client.getSignedUrl(props.command, {
      Bucket: props.Bucket,
      Key: props.Key,
      Expires: signedUrlExpireSeconds,
    });
  }
}
