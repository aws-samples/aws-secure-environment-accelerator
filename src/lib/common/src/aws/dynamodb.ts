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

  async putItem(tableName: string, itemId: string, attributeValue: string): Promise<void> {
    const props = {
      TableName: tableName,
      Item: {
        id: { S: itemId },
        value: { S: attributeValue },
      },
    };
    await throttlingBackOff(() => this.client.putItem(props).promise());
  }

  async batchWriteItem(props: dynamodb.BatchWriteItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.batchWriteItem(props).promise());
  }

  async scanTable(props: dynamodb.ScanInput): Promise<dynamodb.ScanOutput> {
    return await throttlingBackOff(() => this.client.scan(props).promise());
  }

  async getItem(tableName: string, itemId: string): Promise<dynamodb.GetItemOutput> {
    const props = {
      TableName: `${tableName}`,
      Key: { id: { S: `${itemId}` } },
    };
    return await throttlingBackOff(() => this.client.getItem(props).promise());
  }
}
