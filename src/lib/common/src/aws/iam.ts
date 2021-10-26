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
import * as iam from 'aws-sdk/clients/iam';
import { throttlingBackOff } from './backoff';

export class IAM {
  private readonly client: aws.IAM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.IAM({
      credentials,
    });
  }

  /**
   * to create aws service linked role.
   * @param awsServiceName
   */
  async createServiceLinkedRole(awsServiceName: string): Promise<iam.CreateServiceLinkedRoleResponse> {
    const params: iam.CreateServiceLinkedRoleRequest = {
      AWSServiceName: awsServiceName,
    };
    return throttlingBackOff(() => this.client.createServiceLinkedRole(params).promise());
  }
}
