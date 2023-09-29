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

  async deleteObjects(input: s3.DeleteObjectsRequest): Promise<s3.DeleteObjectsOutput> {
    return throttlingBackOff(() => this.client.deleteObjects(input).promise());
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
  async copyObject(sourceBucket: string, sourceKey: string, destinationBucket: string, destinationPrefix: string) {
    await throttlingBackOff(() =>
      this.client
        .copyObject({
          Bucket: destinationBucket,
          CopySource: `${sourceBucket}/${sourceKey}`,
          Key: `${destinationPrefix}/${sourceKey}`,
        })
        .promise(),
    );
  }

  async copyObjectWithACL(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationPrefix: string,
    acl: string,
  ) {
    await throttlingBackOff(() =>
      this.client
        .copyObject({
          Bucket: destinationBucket,
          CopySource: `${sourceBucket}/${sourceKey}`,
          Key: `${destinationPrefix}/${sourceKey}`,
          ACL: acl,
        })
        .promise(),
    );
  }
  async listBucket(bucket: string) {
    let token;
    const params: s3.ListObjectsV2Request = {
      Bucket: bucket,
      ContinuationToken: token,
    };
    const items = [];
    do {
      const response = await throttlingBackOff(() => this.client.listObjectsV2(params).promise());
      if (response.Contents) {
        items.push(...response.Contents);
      }
      if (response.NextContinuationToken) {
        params.ContinuationToken = response.NextContinuationToken;
      } else {
        params.ContinuationToken = undefined;
      }
    } while (params.ContinuationToken);

    return items;
  }
}
