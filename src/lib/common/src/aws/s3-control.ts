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
