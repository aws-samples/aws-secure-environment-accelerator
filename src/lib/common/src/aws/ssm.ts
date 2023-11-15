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
  GetParameterCommandOutput,
  ParameterHistory,
  PutParameterCommandOutput,
  SSM as ssm,
} from '@aws-sdk/client-ssm';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';

export class SSM {
  private readonly client: SSM;
  private readonly cache: { [roleArn: string]: aws.Credentials } = {};

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new ssm({
      credentials,
      region,
      logger: console,
    });
  }

  async getParameter(name: string): Promise<GetParameterCommandOutput> {
    return throttlingBackOff(() =>
      this.client
        .getParameter({
          Name: name,
        })
        .promise(),
    );
  }

  async getParameterHistory(name: string): Promise<ParameterHistory[]> {
    const parameterVersions: ParameterHistory[] = [];
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

  async putParameter(name: string, value: string): Promise<PutParameterCommandOutput> {
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
