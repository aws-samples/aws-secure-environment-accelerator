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

import * as ssm from 'aws-sdk/clients/ssm';
import aws from './aws-client';
import { throttlingBackOff } from './backoff';

export class SSM {
  private readonly client: aws.SSM;

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.SSM({
      credentials,
      region,
    });
  }

  async putParameter(props: ssm.PutParameterRequest): Promise<void> {
    await throttlingBackOff(() => this.client.putParameter(props).promise());
  }
}
