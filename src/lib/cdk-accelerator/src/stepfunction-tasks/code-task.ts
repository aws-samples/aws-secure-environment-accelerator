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
  export type FunctionProps = Pick<lambda.FunctionProps, 'code'> & Partial<Omit<lambda.FunctionProps, 'runtime'>>;

  // tslint:disable-next-line: deprecation
  export interface Props extends Partial<Omit<sfn.TaskProps, 'task'>> {
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
  // tslint:disable-next-line: deprecation
  public readonly startState: sfn.Task;
  public readonly endStates: sfn.INextable[];

  constructor(scope: cdk.Construct, id: string, props: CodeTask.Props) {
    super(scope, id);

    const func = new lambda.Function(this, 'Handler', {
      timeout: cdk.Duration.minutes(15),
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      ...props.functionProps,
    });

    // tslint:disable-next-line: deprecation
    const task = new sfn.Task(this, id, {
      // tslint:disable-next-line: deprecation
      task: new tasks.InvokeFunction(func, {
        payload: props.functionPayload,
      }),
      ...props,
    });

    // Retriable exceptions, Using all defaults for interval: 1, maxAttempts: 3, backoffRate: 2
    // tslint:disable-next-line: deprecation
    task.addRetry({
      errors: ['ServiceUnavailableException'],
    });

    this.startState = task;
    this.endStates = [task];
  }

  addCatch(handler: sfn.IChainable, props?: sfn.CatchProps): this {
    // tslint:disable-next-line: deprecation
    this.startState.addCatch(handler, props);
    return this;
  }
}
