import * as aws from 'aws-sdk';
import * as smn from 'aws-sdk/clients/secretsmanager';
import { listWithNextTokenGenerator } from './next-token';
import { collectAsync } from '../util/generator';

export class SecretsManager {
  private readonly client: aws.SecretsManager;

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.SecretsManager({
      credentials,
    });
  }

  async createSecret(input: smn.CreateSecretRequest): Promise<smn.CreateSecretResponse> {
    return this.client.createSecret(input).promise();
  }

  async restoreSecret(secretId: string): Promise<smn.RestoreSecretResponse> {
    return this.client
      .restoreSecret({
        SecretId: secretId,
      })
      .promise();
  }

  async deleteSecret(secretId: string): Promise<smn.DeleteSecretResponse> {
    return this.client.deleteSecret({ SecretId: secretId }).promise();
  }

  async putSecretValue(input: smn.PutSecretValueRequest): Promise<smn.PutSecretValueResponse> {
    return this.client.putSecretValue(input).promise();
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
    return this.client.getSecretValue({ SecretId: secretId }).promise();
  }

  async getSecrets(secretIds: string[]): Promise<smn.GetSecretValueResponse[]> {
    return collectAsync(this.getSecretValuesGenerator(secretIds));
  }

  async *getSecretValuesGenerator(secretIds: string[]): AsyncIterableIterator<smn.GetSecretValueResponse> {
    for (const secretId of secretIds) {
      yield await this.getSecret(secretId);
    }
  }
}
