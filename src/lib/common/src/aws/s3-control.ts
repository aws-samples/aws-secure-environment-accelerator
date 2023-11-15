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

import aws from 'aws-sdk';

import {
  GetPublicAccessBlockCommandInput,
  GetPublicAccessBlockCommandOutput,
  PutPublicAccessBlockCommandInput,
  S3Control as s3control,
} from '@aws-sdk/client-s3-control';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';

export class S3Control {
  private readonly client: S3Control;

  public constructor(credentials?: aws.Credentials) {
    this.client = new s3control({
      credentials,
      logger: console,
    });
  }

  /**
   * to put the s3 public access block setting at account level
   * @param input
   */
  async putPublicAccessBlock(input: PutPublicAccessBlockCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.putPublicAccessBlock(input).promise());
  }

  /**
   * to get the s3 public access block setting at account level
   * @param input
   */
  async getPublicAccessBlock(
    input: GetPublicAccessBlockCommandInput,
  ): Promise<GetPublicAccessBlockCommandOutput> {
    return throttlingBackOff(() => this.client.getPublicAccessBlock(input).promise());
  }
}
