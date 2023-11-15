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
import { PublishCommandInput, PublishCommandOutput, SNS as sns } from '@aws-sdk/client-sns';
import { throttlingBackOff } from './backoff';

export class SNS {
  private readonly client: SNS;

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new sns({
      credentials,
      region,
      logger: console,
    });
  }

  async publish(params: PublishCommandInput): Promise<PublishCommandOutput> {
    const response = await throttlingBackOff(() => this.client.publish(params).promise());
    return response;
  }
}
