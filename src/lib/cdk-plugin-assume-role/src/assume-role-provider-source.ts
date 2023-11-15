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

import * as aws from 'aws-sdk';
import { AssumeRoleCommandOutput, STS } from '@aws-sdk/client-sts';
// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { CredentialProviderSource } from 'aws-cdk/lib/api/plugin';
import { Mode } from 'aws-cdk/lib/api/aws-auth/credentials';
import { green } from 'colors/safe';
import { throttlingBackOff } from './backoff';

export interface AssumeRoleProviderSourceProps {
  name: string;
  assumeRoleName: string;
  assumeRoleDuration: number;
  region: string | undefined;
}

export class AssumeRoleProviderSource implements CredentialProviderSource {
  readonly name = this.props.name;
  private readonly cache: { [accountId: string]: aws.Credentials } = {};

  constructor(private readonly props: AssumeRoleProviderSourceProps) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async canProvideCredentials(accountId: string): Promise<boolean> {
    return true;
  }

  async getProvider(accountId: string, mode: Mode): Promise<aws.Credentials> {
    if (this.cache[accountId]) {
      return this.cache[accountId];
    }

    let assumeRole;
    try {
      // Try to assume the role with the given duration
      assumeRole = await this.assumeRole(accountId, this.props.assumeRoleDuration);
    } catch (e) {
      console.warn(`Cannot assume role for ${this.props.assumeRoleDuration} seconds: ${e}`);

      // If that fails, than try to assume the role for one hour
      assumeRole = await this.assumeRole(accountId, 3600);
    }

    const credentials = assumeRole.Credentials!;
    return (this.cache[accountId] = new aws.Credentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    }));
  }

  protected async assumeRole(accountId: string, duration: number): Promise<AssumeRoleCommandOutput> {
    const roleArn = `arn:aws:iam::${accountId}:role/${this.props.assumeRoleName}`;
    console.log(`Assuming role ${green(roleArn)} for ${duration} seconds`);
    const region = this.props.region;
    let endpoint;
    if (region) {
      endpoint = `sts.${region}.amazonaws.com`;
    }
    const sts = new STS({
      // The transformation for endpoint is not implemented.
      // Refer to UPGRADING.md on aws-sdk-js-v3 for changes needed.
      // Please create/upvote feature request on aws-sdk-js-codemod for endpoint.
      endpoint,

      region,
      logger: console,
    });
    return throttlingBackOff(() =>
      sts
        .assumeRole({
          RoleArn: roleArn,
          RoleSessionName: this.name,
          DurationSeconds: duration,
        }),
    );
  }
}
