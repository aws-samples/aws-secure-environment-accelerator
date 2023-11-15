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
  ConfigService,
  DeleteConfigurationAggregatorCommandInput,
  DescribeConfigurationAggregatorsCommandInput,
  DescribeConfigurationAggregatorsCommandOutput,
  DescribeConfigurationRecordersCommandInput,
  DescribeConfigurationRecordersCommandOutput,
  DescribeConfigurationRecorderStatusCommandInput,
  DescribeConfigurationRecorderStatusCommandOutput,
  DescribeDeliveryChannelStatusCommandInput,
  DescribeDeliveryChannelStatusCommandOutput,
  PutConfigurationAggregatorCommandInput,
  PutConfigurationRecorderCommandInput,
  PutDeliveryChannelCommandInput,
  PutEvaluationsCommandInput,
  StartConfigurationRecorderCommandInput,
  StopConfigurationRecorderCommandInput,
} from '@aws-sdk/client-config-service';
import { throttlingBackOff } from './backoff';

export class ConfigService {
  private readonly client: ConfigService;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new ConfigService({
      region,
      credentials,
      logger: console,
    });
  }

  /**
   *
   * Creates a Config Recorder
   *
   * @param PutConfigurationRecorderRequest
   */
  async createRecorder(input: PutConfigurationRecorderCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.putConfigurationRecorder(input).promise());
  }

  /**
   *
   * Creates a Delivery Channel
   *
   * @param PutDeliveryChannelRequest
   */
  async createDeliveryChannel(input: PutDeliveryChannelCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.putDeliveryChannel(input).promise());
  }

  /**
   * Start Configuration Recorder
   */
  async startRecorder(input: StartConfigurationRecorderCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.startConfigurationRecorder(input).promise());
  }

  /**
   *
   * Creates a Config Aggregator
   *
   * @param PutConfigurationAggregatorRequest
   */
  async createAggregator(input: PutConfigurationAggregatorCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.putConfigurationAggregator(input).promise());
  }

  /**
   *
   * Creates a Config Aggregator
   *
   * @param DeleteConfigurationAggregatorRequest
   */
  async deleteAggregator(input: DeleteConfigurationAggregatorCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.deleteConfigurationAggregator(input).promise());
  }

  /**
   *
   * Lists Config Aggregators
   *
   * @param DescribeConfigurationAggregatorsRequest
   */
  async describeConfigurationAggregators(
    input: DescribeConfigurationAggregatorsCommandInput,
  ): Promise<DescribeConfigurationAggregatorsCommandOutput> {
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
    input: DescribeConfigurationRecordersCommandInput,
  ): Promise<DescribeConfigurationRecordersCommandOutput> {
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
    input: DescribeDeliveryChannelStatusCommandInput,
  ): Promise<DescribeDeliveryChannelStatusCommandOutput> {
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
    input: DescribeConfigurationRecorderStatusCommandInput,
  ): Promise<DescribeConfigurationRecorderStatusCommandOutput> {
    const describeRecorderStatus = await throttlingBackOff(() =>
      this.client.describeConfigurationRecorderStatus(input).promise(),
    );
    return describeRecorderStatus;
  }

  /**
   * Stop Configuration Recorder
   */
  async stopRecorder(input: StopConfigurationRecorderCommandInput): Promise<void> {
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
  async putEvaluations(input: PutEvaluationsCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.putEvaluations(input).promise());
  }
}
