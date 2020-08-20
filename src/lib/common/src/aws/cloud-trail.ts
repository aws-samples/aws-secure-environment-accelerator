import * as aws from 'aws-sdk';
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
    return await throttlingBackOff(() => this.client.describeTrails(params).promise());
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
    return await throttlingBackOff(() => this.client.putInsightSelectors(params).promise());
  }

  /**
   * to put event selects for a existing cloud trail
   * @param params
   */
  async putEventSelectors(params: cloudtrail.PutEventSelectorsRequest): Promise<cloudtrail.PutEventSelectorsResponse> {
    return await throttlingBackOff(() => this.client.putEventSelectors(params).promise());
  }

  /**
   * to update a existing cloud trail
   * @param params
   */
  async updateTrail(params: cloudtrail.UpdateTrailRequest): Promise<cloudtrail.UpdateTrailResponse> {
    return await throttlingBackOff(() => this.client.updateTrail(params).promise());
  }
}
