import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';

export namespace CodeTask {
  /**
   *  Based on `lambda.FunctionProps` where
   *   * `code` is required;
   *   * `handler`, `runtime` are excluded;
   *   * other properties are optional.
   */
  export type FunctionProps = Pick<lambda.FunctionProps, 'code'> &
    Partial<Omit<lambda.FunctionProps, 'runtime'>> &
    Partial<Omit<lambda.FunctionProps, 'memorySize'>>;

  export interface Props extends sfn.TaskStateBaseProps {
    /**
     * The payload that is used for the `InvokeFunction` task.
     */
    functionPayload?: { [key: string]: unknown };
    /**
     * The props that are passed to the Lambda function.
     */
    functionProps: FunctionProps;
  }
}

/**
 * Class that represents a step function invoke function task.
 */
export class CodeTask extends sfn.StateMachineFragment {
  public readonly startState: tasks.LambdaInvoke;
  public readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CodeTask.Props) {
    super(scope, id);

    const func = new lambda.Function(this, 'Handler', {
      timeout: cdk.Duration.minutes(15),
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      memorySize: 512,
      ...props.functionProps,
      deadLetterQueueEnabled: true,
    });

    const funcAlias = new lambda.Alias(this, 'LambdaAlias', {
      aliasName: 'live',
      version: func.currentVersion,
    });

    const task = new tasks.LambdaInvoke(this, id, {
      lambdaFunction: funcAlias,
      payload: sfn.TaskInput.fromObject(props.functionPayload!),
      payloadResponseOnly: true,
      ...props,
    });

    task.addRetry({
      errors: ['ServiceUnavailableException'],
    });
    this.startState = task;
    this.endStates = [task];
  }

  addCatch(handler: sfn.IChainable, props?: sfn.CatchProps): this {
    this.startState.addCatch(handler, props);
    return this;
  }
}
