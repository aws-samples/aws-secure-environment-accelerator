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
import { CreateTagsCommandInput, DescribeTagsCommandInput, EC2 as ec2 } from '@aws-sdk/client-ec2';
import { throttlingBackOff } from './backoff';

export class TagResources {
  private readonly client: EC2;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new ec2({
      credentials,
      region,
      logger: console,
    });
  }

  async createTags(input: CreateTagsCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.createTags(input).promise());
  }

  async hasTag(input: DescribeTagsCommandInput): Promise<boolean> {
    const result = await throttlingBackOff(() => this.client.describeTags(input).promise());
    return result.Tags!.length > 0;
  }
}
