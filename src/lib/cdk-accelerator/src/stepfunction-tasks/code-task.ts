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

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

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

  constructor(scope: Construct, id: string, props: CodeTask.Props) {
    super(scope, id);

    const func = new lambda.Function(this, 'Handler', {
      timeout: cdk.Duration.minutes(15),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      memorySize: 512,
      ...props.functionProps,
    });

    // const funcAlias = new lambda.Alias(this, 'LambdaAlias', {
    //   aliasName: 'live',
    //   version: func.currentVersion,
    // });

    const task = new tasks.LambdaInvoke(this, id, {
      lambdaFunction: func,
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
