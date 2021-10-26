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
import * as ssm from 'aws-sdk/clients/ssm';
import { throttlingBackOff } from './backoff';

export class SSM {
  private readonly client: aws.SSM;
  private readonly cache: { [roleArn: string]: aws.Credentials } = {};

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.SSM({
      credentials,
      region,
    });
  }

  async getParameter(name: string): Promise<ssm.GetParameterResult> {
    return throttlingBackOff(() =>
      this.client
        .getParameter({
          Name: name,
        })
        .promise(),
    );
  }

  async getParameterHistory(name: string): Promise<ssm.ParameterHistory[]> {
    const parameterVersions: ssm.ParameterHistory[] = [];
    let token: string | undefined;
    do {
      const response = await throttlingBackOff(() =>
        this.client.getParameterHistory({ Name: name, NextToken: token, MaxResults: 50 }).promise(),
      );
      token = response.NextToken;
      parameterVersions.push(...response.Parameters!);
    } while (token);
    return parameterVersions;
  }

  async putParameter(name: string, value: string): Promise<ssm.PutParameterResult> {
    return throttlingBackOff(() =>
      this.client
        .putParameter({
          Name: name,
          Type: 'String',
          Value: value,
          Overwrite: true,
        })
        .promise(),
    );
  }

  async deleteParameters(names: string[]): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .deleteParameters({
          Names: names,
        })
        .promise(),
    );
  }
}
