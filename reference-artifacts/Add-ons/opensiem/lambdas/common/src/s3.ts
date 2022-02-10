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
}
