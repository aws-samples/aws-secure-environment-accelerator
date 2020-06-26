import { ListExecutionsInput, ExecutionListItem, StartExecutionInput } from 'aws-sdk/clients/stepfunctions';
import * as aws from 'aws-sdk';
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
    const executions = await throttlingBackOff(() => this.client.listExecutions(input).promise());
    return executions.executions;
  }

  /**
   * Run Statemachine
   */
  async startExecution(input: StartExecutionInput): Promise<string> {
    const execution = await throttlingBackOff(() => this.client.startExecution(input).promise());
    return execution.executionArn;
  }
}
