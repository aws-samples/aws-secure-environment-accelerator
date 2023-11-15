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
  CreateSecretCommandInput,
  CreateSecretCommandOutput,
  DeleteSecretCommandOutput,
  GetSecretValueCommandOutput,
  ListSecretsCommandInput,
  PutResourcePolicyCommandInput,
  PutResourcePolicyCommandOutput,
  PutSecretValueCommandInput,
  PutSecretValueCommandOutput,
  RestoreSecretCommandOutput,
  SecretListEntry,
  SecretsManager as smn,
} from '@aws-sdk/client-secrets-manager';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { listWithNextTokenGenerator } from './next-token';
import { collectAsync } from '../util/generator';
import { throttlingBackOff } from './backoff';

export class SecretsManager {
  private readonly client: SecretsManager;

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new smn({
      credentials,
      region,
      logger: console,
    });
  }

  async createSecret(input: CreateSecretCommandInput): Promise<CreateSecretCommandOutput> {
    return throttlingBackOff(() => this.client.createSecret(input).promise());
  }

  async restoreSecret(secretId: string): Promise<RestoreSecretCommandOutput> {
    return throttlingBackOff(() =>
      this.client
        .restoreSecret({
          SecretId: secretId,
        })
        .promise(),
    );
  }

  async deleteSecret(secretId: string): Promise<DeleteSecretCommandOutput> {
    return throttlingBackOff(() => this.client.deleteSecret({ SecretId: secretId }).promise());
  }

  async putSecretValue(input: PutSecretValueCommandInput): Promise<PutSecretValueCommandOutput> {
    return throttlingBackOff(() => this.client.putSecretValue(input).promise());
  }

  async listSecrets(input: ListSecretsCommandInput = {}): Promise<SecretListEntry[]> {
    return collectAsync(this.listSecretsGenerator(input));
  }

  async *listSecretsGenerator(input: ListSecretsCommandInput = {}): AsyncIterableIterator<SecretListEntry> {
    yield* listWithNextTokenGenerator<smn.ListSecretsRequest, smn.ListSecretsResponse, smn.SecretListEntry>(
      this.client.listSecrets.bind(this.client),
      r => r.SecretList!,
      input,
    );
  }

  async getSecret(secretId: string): Promise<GetSecretValueCommandOutput> {
    try {
      // Make sure to have await here to catch the exception
      return throttlingBackOff(() => this.client.getSecretValue({ SecretId: secretId }).promise());
    } catch (e) {
      throw new Error(`Cannot get secret ${secretId}: ${e}`);
    }
  }

  async getSecrets(secretIds: string[]): Promise<GetSecretValueCommandOutput[]> {
    return collectAsync(this.getSecretValuesGenerator(secretIds));
  }

  async *getSecretValuesGenerator(secretIds: string[]): AsyncIterableIterator<GetSecretValueCommandOutput> {
    for (const secretId of secretIds) {
      yield await this.getSecret(secretId);
    }
  }

  async putResourcePolicy(input: PutResourcePolicyCommandInput): Promise<PutResourcePolicyCommandOutput> {
    return throttlingBackOff(() => this.client.putResourcePolicy(input).promise());
  }
}
