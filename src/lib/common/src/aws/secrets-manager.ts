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
import * as smn from 'aws-sdk/clients/secretsmanager';
import { listWithNextTokenGenerator } from './next-token';
import { collectAsync } from '../util/generator';
import { throttlingBackOff } from './backoff';

export class SecretsManager {
  private readonly client: aws.SecretsManager;

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.SecretsManager({
      credentials,
      region,
    });
  }

  async createSecret(input: smn.CreateSecretRequest): Promise<smn.CreateSecretResponse> {
    return throttlingBackOff(() => this.client.createSecret(input).promise());
  }

  async restoreSecret(secretId: string): Promise<smn.RestoreSecretResponse> {
    return throttlingBackOff(() =>
      this.client
        .restoreSecret({
          SecretId: secretId,
        })
        .promise(),
    );
  }

  async deleteSecret(secretId: string): Promise<smn.DeleteSecretResponse> {
    return throttlingBackOff(() => this.client.deleteSecret({ SecretId: secretId }).promise());
  }

  async putSecretValue(input: smn.PutSecretValueRequest): Promise<smn.PutSecretValueResponse> {
    return throttlingBackOff(() => this.client.putSecretValue(input).promise());
  }

  async listSecrets(input: smn.ListSecretsRequest = {}): Promise<smn.SecretListEntry[]> {
    return collectAsync(this.listSecretsGenerator(input));
  }

  async *listSecretsGenerator(input: smn.ListSecretsRequest = {}): AsyncIterableIterator<smn.SecretListEntry> {
    yield* listWithNextTokenGenerator<smn.ListSecretsRequest, smn.ListSecretsResponse, smn.SecretListEntry>(
      this.client.listSecrets.bind(this.client),
      r => r.SecretList!,
      input,
    );
  }

  async getSecret(secretId: string): Promise<smn.GetSecretValueResponse> {
    try {
      // Make sure to have await here to catch the exception
      return throttlingBackOff(() => this.client.getSecretValue({ SecretId: secretId }).promise());
    } catch (e) {
      throw new Error(`Cannot get secret ${secretId}: ${e}`);
    }
  }

  async getSecrets(secretIds: string[]): Promise<smn.GetSecretValueResponse[]> {
    return collectAsync(this.getSecretValuesGenerator(secretIds));
  }

  async *getSecretValuesGenerator(secretIds: string[]): AsyncIterableIterator<smn.GetSecretValueResponse> {
    for (const secretId of secretIds) {
      yield await this.getSecret(secretId);
    }
  }

  async putResourcePolicy(input: smn.PutResourcePolicyRequest): Promise<smn.PutResourcePolicyResponse> {
    return throttlingBackOff(() => this.client.putResourcePolicy(input).promise());
  }
}
