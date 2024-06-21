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
import { EnableRegionRequest, GetRegionOptStatusRequest, GetRegionOptStatusResponse } from 'aws-sdk/clients/account';
import { throttlingBackOff } from './backoff';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';
import { collectAsync } from '../util/generator';

export class Account {
  private readonly client: aws.Account;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.Account({
      region,
      credentials,
    });
  }

  /**
   * enables opt-in region
   * @param accountId
   * @param regionName
   */
  async enableOptinRegion(regionName: string): Promise<void> {
    const params: EnableRegionRequest = {
      RegionName: regionName,
    };
    await throttlingBackOff(() => this.client.enableRegion(params).promise());
  }

  /**
   * gets Region Optin Status
   * @param accountId
   * @param regionName
   */
  async getRegionOptinStatus(regionName: string): Promise<GetRegionOptStatusResponse> {
    const params: GetRegionOptStatusRequest = {
      RegionName: regionName,
    };
    return await throttlingBackOff(() => this.client.getRegionOptStatus(params).promise());
  }
}
