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
  CloudTrail as cloudtrail,
  DescribeTrailsCommandInput,
  DescribeTrailsCommandOutput,
  PutEventSelectorsCommandInput,
  PutEventSelectorsCommandOutput,
  PutInsightSelectorsCommandInput,
  PutInsightSelectorsCommandOutput,
  UpdateTrailCommandInput,
  UpdateTrailCommandOutput,
} from '@aws-sdk/client-cloudtrail';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';

export class CloudTrail {
  private readonly client: CloudTrail;

  public constructor(credentials?: aws.Credentials) {
    this.client = new cloudtrail({
      credentials,
      logger: console,
    });
  }

  /**
   * to describe trails
   * @param params
   */
  async describeTrails(
    includeShadowTrails: boolean,
    trailNameList: string[],
  ): Promise<DescribeTrailsCommandOutput> {
    const params: DescribeTrailsCommandInput = {
      includeShadowTrails,
      trailNameList,
    };
    return throttlingBackOff(() => this.client.describeTrails(params).promise());
  }

  /**
   * to enable insight selectors for a existing cloud trail
   * @param trailName
   */
  async putInsightSelectors(trailName: string): Promise<PutInsightSelectorsCommandOutput> {
    const params: PutInsightSelectorsCommandInput = {
      InsightSelectors: [
        {
          InsightType: 'ApiCallRateInsight',
        },
      ],
      TrailName: trailName,
    };
    return throttlingBackOff(() => this.client.putInsightSelectors(params).promise());
  }

  /**
   * to put event selects for a existing cloud trail
   * @param params
   */
  async putEventSelectors(params: PutEventSelectorsCommandInput): Promise<PutEventSelectorsCommandOutput> {
    return throttlingBackOff(() => this.client.putEventSelectors(params).promise());
  }

  /**
   * to update a existing cloud trail
   * @param params
   */
  async updateTrail(params: UpdateTrailCommandInput): Promise<UpdateTrailCommandOutput> {
    return throttlingBackOff(() => this.client.updateTrail(params).promise());
  }
}
