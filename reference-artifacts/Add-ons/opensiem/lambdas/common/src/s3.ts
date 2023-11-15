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
  Body,
  GetObjectCommandInput,
  PutObjectCommandInput,
  PutObjectCommandOutput,
  S3 as s3,
} from '@aws-sdk/client-s3';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';

export class S3 {
  private readonly client: S3;

  public constructor(credentials?: aws.Credentials) {
    this.client = new s3({
      credentials,
      logger: console,
    });
  }

  async getObjectBody(input: GetObjectCommandInput): Promise<Body> {
    const object = await throttlingBackOff(() => this.client.getObject(input).promise());
    return object.Body!;
  }

  async getObjectBodyAsString(input: GetObjectCommandInput): Promise<string> {
    return this.getObjectBody(input).then(body => body.toString());
  }

  async putObject(input: PutObjectCommandInput): Promise<PutObjectCommandOutput> {
    return throttlingBackOff(() => this.client.putObject(input).promise());
  }
}
