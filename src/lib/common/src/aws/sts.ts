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
import * as sts from 'aws-sdk/clients/sts';
import { throttlingBackOff } from './backoff';
export class STS {
  private readonly client: aws.STS;
  private readonly cache: { [roleArn: string]: aws.Credentials } = {};

  constructor(credentials?: aws.Credentials) {
    let region;
    let endpoint;
    if (process.env.AWS_REGION) {
      region = process.env.AWS_REGION;
      endpoint = `sts.${process.env.AWS_REGION}.amazonaws.com`;
    }

    this.client = new aws.STS({
      credentials,
      region,
      endpoint,
    });
  }

  async getCallerIdentity(): Promise<sts.GetCallerIdentityResponse> {
    return throttlingBackOff(() => this.client.getCallerIdentity().promise());
  }

  async getCredentialsForRoleArn(assumeRoleArn: string, durationSeconds: number = 3600): Promise<aws.Credentials> {
    if (this.cache[assumeRoleArn]) {
      const cachedCredentials = this.cache[assumeRoleArn];
      const currentDate = new Date();
      if (cachedCredentials.expireTime && cachedCredentials.expireTime.getTime() < currentDate.getTime()) {
        return cachedCredentials;
      }
    }

    const response = await throttlingBackOff(() =>
      this.client
        .assumeRole({
          RoleArn: assumeRoleArn,
          RoleSessionName: 'temporary', // TODO Generate a random name
          DurationSeconds: durationSeconds,
        })
        .promise(),
    );

    const stsCredentials = response.Credentials!;
    const credentials = new aws.Credentials({
      accessKeyId: stsCredentials.AccessKeyId,
      secretAccessKey: stsCredentials.SecretAccessKey,
      sessionToken: stsCredentials.SessionToken,
    });
    this.cache[assumeRoleArn] = credentials;
    return credentials;
  }

  async getCredentialsForAccountAndRole(
    accountId: string,
    assumeRole: string,
    durationSeconds?: number,
  ): Promise<aws.Credentials> {
    return this.getCredentialsForRoleArn(`arn:aws:iam::${accountId}:role/${assumeRole}`, durationSeconds);
  }
}
