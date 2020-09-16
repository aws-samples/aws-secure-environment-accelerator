import aws from './aws-client';
import * as dynamodb from 'aws-sdk/clients/dynamodb';
import { throttlingBackOff } from './backoff';

interface Attribute {
  key: string;
  value: string;
  name: string;
  type: 'S' | 'N' | 'B';
}

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

  async batchWriteItem(props: dynamodb.BatchWriteItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.batchWriteItem(props).promise());
  }

  async scan(props: dynamodb.ScanInput): Promise<dynamodb.ItemList> {
    const items: dynamodb.ItemList = [];
    let token: dynamodb.Key | undefined;
    // TODO: Use common listgenerator when this api supports nextToken
    do {
      // TODO: Use DynamoDB.Converter for scan and Query
      const response = await throttlingBackOff(() => this.client.scan(props).promise());
      token = response.LastEvaluatedKey;
      props.ExclusiveStartKey = token;
      items.push(...response.Items!);
    } while (token);
    return items;
  }

  async isEmpty(tableName: string): Promise<boolean> {
    const record = await throttlingBackOff(() =>
      this.client
        .scan({
          TableName: tableName,
          Limit: 1,
        })
        .promise(),
    );
    return !record.Count;
  }

  async putItem(props: dynamodb.PutItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.putItem(props).promise());
  }

  async getItem(props: dynamodb.GetItemInput): Promise<dynamodb.GetItemOutput> {
    return throttlingBackOff(() => this.client.getItem(props).promise());
  }

  async deleteItem(props: dynamodb.DeleteItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.deleteItem(props).promise());
  }

  async updateItem(props: dynamodb.UpdateItemInput): Promise<void> {
    await throttlingBackOff(() => this.client.updateItem(props).promise());
  }

  getUpdateValueInput(attributes: Attribute[]) {
    if (attributes.length === 0) {
      return;
    }
    const expAttributeNames: aws.DynamoDB.ExpressionAttributeNameMap = {};
    const expAttributeValues: aws.DynamoDB.ExpressionAttributeValueMap = {};
    let updateExpression: string = 'set ';
    for (const att of attributes) {
      const attributeValue: aws.DynamoDB.AttributeValue = {};
      expAttributeNames[`#${att.key}`] = att.name;
      attributeValue[att.type] = att.value;
      expAttributeValues[`:${att.key}`] = attributeValue;
      updateExpression += `#${att.key} = :${att.key},`;
    }
    // Remove "," if exists as last character
    updateExpression = updateExpression.endsWith(',') ? updateExpression.slice(0, -1) : updateExpression;

    return {
      ExpressionAttributeNames: expAttributeNames,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expAttributeValues,
    };
  }
}
