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
import {
  PutConfigurationRecorderRequest,
  PutDeliveryChannelRequest,
  DescribeConfigurationAggregatorsRequest,
  DescribeConfigurationAggregatorsResponse,
  DescribeConfigurationRecordersRequest,
  DescribeConfigurationRecordersResponse,
  DescribeConfigurationRecorderStatusRequest,
  DescribeConfigurationRecorderStatusResponse,
  DescribeDeliveryChannelStatusRequest,
  DescribeDeliveryChannelStatusResponse,
  StartConfigurationRecorderRequest,
  PutConfigurationAggregatorRequest,
  StopConfigurationRecorderRequest,
  PutEvaluationsRequest,
  DeleteConfigurationAggregatorRequest,
} from 'aws-sdk/clients/configservice';
import { throttlingBackOff } from './backoff';

export class ConfigService {
  private readonly client: aws.ConfigService;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.ConfigService({
      region,
      credentials,
    });
  }

  /**
   *
   * Creates a Config Recorder
   *
   * @param PutConfigurationRecorderRequest
   */
  async createRecorder(input: PutConfigurationRecorderRequest): Promise<void> {
    await throttlingBackOff(() => this.client.putConfigurationRecorder(input).promise());
  }

  /**
   *
   * Creates a Delivery Channel
   *
   * @param PutDeliveryChannelRequest
   */
  async createDeliveryChannel(input: PutDeliveryChannelRequest): Promise<void> {
    await throttlingBackOff(() => this.client.putDeliveryChannel(input).promise());
  }

  /**
   * Start Configuration Recorder
   */
  async startRecorder(input: StartConfigurationRecorderRequest): Promise<void> {
    await throttlingBackOff(() => this.client.startConfigurationRecorder(input).promise());
  }

  /**
   *
   * Creates a Config Aggregator
   *
   * @param PutConfigurationAggregatorRequest
   */
  async createAggregator(input: PutConfigurationAggregatorRequest): Promise<void> {
    await throttlingBackOff(() => this.client.putConfigurationAggregator(input).promise());
  }

  /**
   *
   * Creates a Config Aggregator
   *
   * @param DeleteConfigurationAggregatorRequest
   */
  async deleteAggregator(input: DeleteConfigurationAggregatorRequest): Promise<void> {
    await throttlingBackOff(() => this.client.deleteConfigurationAggregator(input).promise());
  }

  /**
   *
   * Lists Config Aggregators
   *
   * @param DescribeConfigurationAggregatorsRequest
   */
  async describeConfigurationAggregators(
    input: DescribeConfigurationAggregatorsRequest,
  ): Promise<DescribeConfigurationAggregatorsResponse> {
    const describeConfigurationAggregators = await throttlingBackOff(() =>
      this.client.describeConfigurationAggregators(input).promise(),
    );
    return describeConfigurationAggregators;
  }

  /**
   *
   * Provides details of existing Config Recorder
   *
   * @param DescribeConfigurationRecordersRequest
   */
  async DescribeConfigurationRecorder(
    input: DescribeConfigurationRecordersRequest,
  ): Promise<DescribeConfigurationRecordersResponse> {
    const describeRecorder = await throttlingBackOff(() => this.client.describeConfigurationRecorders(input).promise());
    return describeRecorder;
  }

  /**
   *
   * Provides details of existing delivery channel
   *
   * @param DescribeDeliveryChannelStatusRequest
   */
  async DescribeDeliveryChannelStatus(
    input: DescribeDeliveryChannelStatusRequest,
  ): Promise<DescribeDeliveryChannelStatusResponse> {
    const describeChannelStatus = await throttlingBackOff(() =>
      this.client.describeDeliveryChannelStatus(input).promise(),
    );
    return describeChannelStatus;
  }

  /**
   *
   * Provides status of the configuration recorder
   *
   * @param DescribeConfigurationRecorderStatusRequest
   */
  async DescribeConfigurationRecorderStatus(
    input: DescribeConfigurationRecorderStatusRequest,
  ): Promise<DescribeConfigurationRecorderStatusResponse> {
    const describeRecorderStatus = await throttlingBackOff(() =>
      this.client.describeConfigurationRecorderStatus(input).promise(),
    );
    return describeRecorderStatus;
  }

  /**
   * Stop Configuration Recorder
   */
  async stopRecorder(input: StopConfigurationRecorderRequest): Promise<void> {
    await throttlingBackOff(() => this.client.stopConfigurationRecorder(input).promise());
  }

  /**
   * Delete Configuration Recorder
   */
  async deleteConfigurationRecorder(recorderName: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .deleteConfigurationRecorder({
          ConfigurationRecorderName: recorderName,
        })
        .promise(),
    );
  }

  /**
   * Delete Delivery Channel
   */
  async deleteDeliveryChannel(name: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .deleteDeliveryChannel({
          DeliveryChannelName: name,
        })
        .promise(),
    );
  }

  /**
   * PutEvaluations to configRule
   */
  async putEvaluations(input: PutEvaluationsRequest): Promise<void> {
    await throttlingBackOff(() => this.client.putEvaluations(input).promise());
  }
}
