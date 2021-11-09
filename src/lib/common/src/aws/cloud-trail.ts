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
import * as cloudtrail from 'aws-sdk/clients/cloudtrail';
import { throttlingBackOff } from './backoff';

export class CloudTrail {
  private readonly client: aws.CloudTrail;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.CloudTrail({
      credentials,
    });
  }

  /**
   * to describe trails
   * @param params
   */
  async describeTrails(
    includeShadowTrails: boolean,
    trailNameList: string[],
  ): Promise<cloudtrail.DescribeTrailsResponse> {
    const params: cloudtrail.DescribeTrailsRequest = {
      includeShadowTrails,
      trailNameList,
    };
    return throttlingBackOff(() => this.client.describeTrails(params).promise());
  }

  /**
   * to enable insight selectors for a existing cloud trail
   * @param trailName
   */
  async putInsightSelectors(trailName: string): Promise<cloudtrail.PutInsightSelectorsResponse> {
    const params: cloudtrail.PutInsightSelectorsRequest = {
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
  async putEventSelectors(params: cloudtrail.PutEventSelectorsRequest): Promise<cloudtrail.PutEventSelectorsResponse> {
    return throttlingBackOff(() => this.client.putEventSelectors(params).promise());
  }

  /**
   * to update a existing cloud trail
   * @param params
   */
  async updateTrail(params: cloudtrail.UpdateTrailRequest): Promise<cloudtrail.UpdateTrailResponse> {
    return throttlingBackOff(() => this.client.updateTrail(params).promise());
  }
}
