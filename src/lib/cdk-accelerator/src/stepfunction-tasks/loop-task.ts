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
import { CodeTask } from './code-task';
import { Construct } from 'constructs';

export namespace LoopTask {
  export type FunctionProps = Partial<Omit<CodeTask.FunctionProps, 'code'>>;

  export interface Props {
    /**
     * The payload that is used for the `InvokeFunction` task.
     */
    functionPayload?: { [key: string]: unknown };
    /**
     * The props that are passed to the Lambda function.
     */
    functionProps?: FunctionProps;
    /**
     * The amount of seconds the wait step will wait before looping.
     *
     * @default 10
     */
    waitSeconds?: number;
    /**
     * The main execution code.
     */
    executeStepCode: lambda.Code;
    /**
     * The code that will be executed to verify the outcome of the execution step. The code must return an object
     * containing the given `verifyStatusField` field.
     */
    verifyStepCode: lambda.Code;
    /**
     * The path where the verify steps result will be stored.
     *
     * @default $.verify
     */
    verifyPath?: string;
    /**
     * The field that contains the status of the verify step.
     *
     * @default status
     */
    verifyStatusField?: string;
  }
}

/**
 * Class that represents a step function execute, wait and verify loop.
 */
export class LoopTask extends sfn.StateMachineFragment {
  public readonly startState: sfn.State;
  public readonly endStates: sfn.INextable[];
  private readonly deploy: CodeTask;
  private readonly verify: CodeTask;

  constructor(scope: Construct, id: string, props: LoopTask.Props) {
    super(scope, id);
    const {
      functionPayload,
      functionProps,
      waitSeconds = 10,
      executeStepCode,
      verifyStepCode,
      verifyPath = '$.verify',
      verifyStatusField = 'status',
    } = props;

    const statusPath = `${verifyPath}.${verifyStatusField}`;

    this.deploy = new CodeTask(this, `Exec`, {
      resultPath: sfn.JsonPath.DISCARD,
      functionPayload,
      functionProps: {
        code: executeStepCode,
        ...functionProps,
      },
    });

    this.verify = new CodeTask(this, `Verify`, {
      resultPath: verifyPath,
      functionPayload,
      functionProps: {
        code: verifyStepCode,
        ...functionProps,
      },
    });

    const wait = new sfn.Wait(this, `Wait`, {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
    });

    const pass = new sfn.Pass(this, `Success`);

    const fail = new sfn.Fail(this, `Failure`);

    sfn.Chain.start(this.deploy)
      .next(wait)
      .next(this.verify)
      .next(
        new sfn.Choice(this, `Choice`)
          .when(sfn.Condition.stringEquals(statusPath, 'SUCCESS'), pass)
          .when(sfn.Condition.stringEquals(statusPath, 'FAILURE'), fail)
          .otherwise(wait)
          .afterwards(),
      );

    // Not sure why but we cannot use chain.startState and chain.endStates here.
    this.startState = this.deploy.startState;
    this.endStates = [pass];
  }

  addCatch(handler: sfn.IChainable, props?: sfn.CatchProps): this {
    this.deploy.addCatch(handler, props);
    this.verify.addCatch(handler, props);
    return this;
  }
}
