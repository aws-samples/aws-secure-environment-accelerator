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
import * as kms from 'aws-sdk/clients/kms';
import aws from './aws-client';
import { throttlingBackOff } from './backoff';

export class KMS {
  private readonly client: aws.KMS;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.KMS({
      credentials,
      region,
    });
  }

  async getKeyPolicy(input: kms.GetKeyPolicyRequest) {
    const response = await throttlingBackOff(() => this.client.getKeyPolicy(input).promise());
    return JSON.parse(response.Policy ?? '{"Version": "2012-10-17", "Statement": []}');
  }
}
