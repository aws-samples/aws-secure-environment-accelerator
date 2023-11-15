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
  DescribeExecutionCommandInput,
  DescribeExecutionCommandOutput,
  ExecutionListItem,
  GetExecutionHistoryCommandInput,
  HistoryEvent,
  ListExecutionsCommandInput,
  SFN,
  StartExecutionCommandInput,
  StopExecutionCommandInput,
} from '@aws-sdk/client-sfn';

import aws from 'aws-sdk';
import { throttlingBackOff } from './backoff';
import { listWithNextToken } from './next-token';

export class StepFunctions {
  private readonly client: SFN;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new SFN({
      credentials,
      region,
      logger: console,
    });
  }

  /**
   * list Executions
   */
  async listExecutions(input: ListExecutionsCommandInput): Promise<ExecutionListItem[]> {
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
  async startExecution(input: StartExecutionCommandInput): Promise<string> {
    const execution = await throttlingBackOff(() => this.client.startExecution(input).promise());
    return execution.executionArn;
  }

  /**
   * get-execution-history
   */
  async getExecutionHistory(input: GetExecutionHistoryCommandInput): Promise<Array<HistoryEvent>> {
    const executionHistory = await throttlingBackOff(() => this.client.getExecutionHistory(input).promise());
    return executionHistory.events;
  }

  /**
   * Stop Statemachine execution
   */
  async stopExecution(input: StopExecutionCommandInput) {
    await throttlingBackOff(() => this.client.stopExecution(input).promise());
  }

  /**
   * describe-execution
   */
  async describeExecution(input: DescribeExecutionCommandInput): Promise<DescribeExecutionCommandOutput> {
    return throttlingBackOff(() => this.client.describeExecution(input).promise());
  }
}
