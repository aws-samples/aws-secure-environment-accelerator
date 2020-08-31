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
    throttlingBackOff(() => this.client.createTable(props).promise());
  }

  async putItem(props: dynamodb.PutItemInput): Promise<void> {
    throttlingBackOff(() => this.client.putItem(props).promise());
  }

  async batchWriteItem(props: dynamodb.BatchWriteItemInput): Promise<void> {
    throttlingBackOff(() => this.client.batchWriteItem(props).promise());
  }
}
