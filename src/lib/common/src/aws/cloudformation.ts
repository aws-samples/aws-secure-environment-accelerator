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
import * as cfn from 'aws-sdk/clients/cloudformation';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';
import { Intersect } from '../util/types';
import { collectAsync } from '../util/generator';
import { throttlingBackOff } from './backoff';

export type CreateOrUpdateStackInput = Intersect<cfn.CreateStackInput, cfn.UpdateStackInput>;
export type CreateOrUpdateStackOutput = Intersect<cfn.CreateStackOutput, cfn.UpdateStackOutput>;
export type CreateOrUpdateStackSetInput = Intersect<cfn.CreateStackSetInput, cfn.UpdateStackSetInput>;
export type CreateOrUpdateStackSetOutput = Intersect<cfn.CreateStackSetOutput, cfn.UpdateStackSetOutput>;

export class CloudFormation {
  private readonly client: aws.CloudFormation;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.CloudFormation({
      region,
      credentials,
    });
  }

  /**
   * Auxiliary method that checks if a stack with the given name exists.
   * @param stackName
   */
  async stackExists(stackName: string): Promise<boolean> {
    return !!(await this.describeStack(stackName));
  }

  /**
   * Wrapper around AWS.CloudFormation.listStacks that returns a generator with the summaries.
   */
  listStacksGenerator(input: cfn.ListStacksInput): AsyncIterable<cfn.StackSummary> {
    return listWithNextTokenGenerator<cfn.ListStacksInput, cfn.ListStacksOutput, cfn.StackSummary>(
      this.client.listStacks.bind(this.client),
      r => r.StackSummaries!,
      input,
    );
  }

  /**
   * Wrapper around AWS.CloudFormation.listStacks.
   */
  async listStacks(input: cfn.ListStacksInput): Promise<cfn.StackSummary[]> {
    return collectAsync(this.listStacksGenerator(input));
  }

  /**
   * Wrapper around describeStacks that does not fail when no stack with the given name exists.
   * @param stackName
   * @return AWS.CloudFormation.Stack or null
   */
  async describeStack(stackName: string): Promise<cfn.Stack | undefined> {
    try {
      // AmazonCloudFormationException is thrown when the stack does not exist
      console.log('DesribeStack in cloudformation.ts');
      const response = await throttlingBackOff(() =>
        this.client
          .describeStacks({
            StackName: stackName,
          })
          .promise(),
      );
      return response.Stacks?.[0];
    } catch (error) {
      console.warn(`Ignoring error in describeStack`);
      console.warn(error);
      return undefined;
    }
  }

  async createOrUpdateStack(input: CreateOrUpdateStackInput): Promise<CreateOrUpdateStackOutput | undefined> {
    const exists = await this.stackExists(input.StackName);
    if (exists) {
      return this.updateStack(input);
    }
    return this.createStack(input);
  }

  /**
   * Wrapper around AWS.CloudFormation.createStack.
   */
  async createStack(input: cfn.CreateStackInput): Promise<cfn.CreateStackOutput> {
    input.EnableTerminationProtection = true;
    return throttlingBackOff(() => this.client.createStack(input).promise());
  }

  /**
   * Wrapper around AWS.CloudFormation.updateStack that does not fail when no updates are to be performed.
   */
  async updateStack(input: cfn.UpdateStackInput): Promise<cfn.UpdateStackOutput | undefined> {
    try {
      await throttlingBackOff(() => this.client.updateStack(input).promise());
    } catch (error: any) {
      if (error.message === 'No updates are to be performed.') {
        console.debug(`No updates are to be performed`);
        return;
      }
      throw error;
    }
  }

  /**
   * Wrapper around describeStackSet that does not fail when no stack set with the given name exists.
   * @param stackSetName
   * @return AWS.CloudFormation.StackSet or null
   */
  async describeStackSet(stackSetName: string): Promise<cfn.StackSet | undefined> {
    try {
      const response = await throttlingBackOff(() =>
        this.client
          .describeStackSet({
            StackSetName: stackSetName,
          })
          .promise(),
      );
      return response.StackSet;
    } catch (e: any) {
      console.warn(`Ignoring error in describeStack`);
      console.warn(e);
      return undefined;
    }
  }

  async listStackInstances(stackSetName: string, accountId?: string): Promise<cfn.StackInstanceSummary[]> {
    return listWithNextToken<cfn.ListStackInstancesInput, cfn.ListStackInstancesOutput, cfn.StackInstanceSummary>(
      this.client.listStackInstances.bind(this.client),
      r => r.Summaries!,
      {
        StackSetName: stackSetName,
        StackInstanceAccount: accountId,
      },
    );
  }

  async listStackSetOperations(stackSetName: string): Promise<cfn.StackSetOperationSummary[]> {
    return listWithNextToken<
      cfn.ListStackSetOperationsInput,
      cfn.ListStackSetOperationsOutput,
      cfn.StackSetOperationSummary
    >(this.client.listStackSetOperations.bind(this.client), r => r.Summaries!, {
      StackSetName: stackSetName,
    });
  }

  /**
   * Wrapper around AWS.CloudFormation.createStackSet.
   */
  async createStackSet(input: cfn.CreateStackSetInput): Promise<cfn.CreateStackSetOutput> {
    return throttlingBackOff(() => this.client.createStackSet(input).promise());
  }

  /**
   * Wrapper around AWS.CloudFormation.updateStackSet.
   */
  async updateStackSet(input: cfn.UpdateStackSetInput): Promise<cfn.UpdateStackSetOutput> {
    return throttlingBackOff(() => this.client.updateStackSet(input).promise());
  }

  /**
   * Wrapper around AWS.CloudFormation.createStackInstances.
   */
  async createStackInstances(input: cfn.CreateStackInstancesInput): Promise<cfn.CreateStackInstancesOutput> {
    return throttlingBackOff(() => this.client.createStackInstances(input).promise());
  }

  /**
   * Wrapper around AWS.CloudFormation.updateStackInstances.
   */
  async updateStackInstances(input: cfn.UpdateStackInstancesInput): Promise<cfn.UpdateStackInstancesOutput> {
    return throttlingBackOff(() => this.client.updateStackInstances(input).promise());
  }

  /**
   * Wrapper around AWS.CloudFormation.deleteStackInstances.
   */
  async deleteStackInstances(input: cfn.DeleteStackInstancesInput): Promise<cfn.DeleteStackInstancesOutput> {
    return throttlingBackOff(() => this.client.deleteStackInstances(input).promise());
  }

  async createOrUpdateStackSet(input: CreateOrUpdateStackSetInput): Promise<CreateOrUpdateStackSetOutput | undefined> {
    const stackSetName = input.StackSetName;
    const stackSet = await this.describeStackSet(stackSetName);
    if (stackSet) {
      if (stackSet.TemplateBody !== input.TemplateBody) {
        return this.updateStackSet({
          ...input,
          OperationPreferences: {
            FailureTolerancePercentage: 100,
            MaxConcurrentPercentage: 100,
          },
        });
      } else {
        console.info(`Template for stack set ${stackSetName} is already up to date`);
        return undefined;
      }
    } else {
      return this.createStackSet(input);
    }
  }
}

export function objectToCloudFormationParameters(
  obj: { [key: string]: string } | undefined,
): cfn.Parameter[] | undefined {
  if (!obj) {
    return undefined;
  }
  return Object.getOwnPropertyNames(obj).map(key => {
    return {
      ParameterKey: key,
      ParameterValue: obj[key],
    };
  });
}
