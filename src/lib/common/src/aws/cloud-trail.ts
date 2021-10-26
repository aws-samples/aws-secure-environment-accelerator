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
