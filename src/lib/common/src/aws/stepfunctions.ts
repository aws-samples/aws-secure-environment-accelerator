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

import {
  ListExecutionsInput,
  ExecutionListItem,
  StartExecutionInput,
  GetExecutionHistoryInput,
  HistoryEventList,
  StopExecutionInput,
  DescribeExecutionInput,
  DescribeExecutionOutput,
} from 'aws-sdk/clients/stepfunctions';
import aws from './aws-client';
import { throttlingBackOff } from './backoff';
import { listWithNextToken } from './next-token';

export class StepFunctions {
  private readonly client: aws.StepFunctions;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.StepFunctions({
      credentials,
      region,
    });
  }

  /**
   * list Executions
   */
  async listExecutions(input: ListExecutionsInput): Promise<ExecutionListItem[]> {
    const executionList = [];
    let token;
    do {
      const executions = await throttlingBackOff(() => this.client.listExecutions(input).promise());
      executionList.push(...executions.executions);
      token = executions.nextToken;
    } while (token);
    return executionList;
  }

  /**
   * Run Statemachine
   */
  async startExecution(input: StartExecutionInput): Promise<string> {
    const execution = await throttlingBackOff(() => this.client.startExecution(input).promise());
    return execution.executionArn;
  }

  /**
   * get-execution-history
   */
  async getExecutionHistory(input: GetExecutionHistoryInput): Promise<HistoryEventList> {
    const executionHistory = await throttlingBackOff(() => this.client.getExecutionHistory(input).promise());
    return executionHistory.events;
  }

  /**
   * Stop Statemachine execution
   */
  async stopExecution(input: StopExecutionInput) {
    await throttlingBackOff(() => this.client.stopExecution(input).promise());
  }

  /**
   * describe-execution
   */
  async describeExecution(input: DescribeExecutionInput): Promise<DescribeExecutionOutput> {
    return throttlingBackOff(() => this.client.describeExecution(input).promise());
  }
}
