import aws from './aws-client';
import * as dynamodb from 'aws-sdk/clients/dynamodb';
import { throttlingBackOff } from './backoff';

export class DynamoDB {
  private readonly client: aws.DynamoDB;

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.DynamoDB({
      credentials,
    });
  }

  async createTable(props: dynamodb.CreateTableInput): Promise<void> {
    await throttlingBackOff(() => this.client.createTable(props).promise());
  }

  async putItem(props: dynamodb.PutItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.putItem(props).promise());
  }

  async batchWriteItem(props: dynamodb.BatchWriteItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.batchWriteItem(props).promise());
  }

  async scan(props: dynamodb.ScanInput): Promise<dynamodb.ScanOutput> {
    return throttlingBackOff(() => this.client.scan(props).promise());
  }

  async deleteItem(props: dynamodb.DeleteItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.deleteItem(props).promise());
  }
}
