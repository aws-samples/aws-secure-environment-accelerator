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
import * as dynamodb from 'aws-sdk/clients/dynamodb';
import { throttlingBackOff } from './backoff';

export class DynamoDB {
  private readonly client: aws.DynamoDB;
  readonly documentClient: aws.DynamoDB.DocumentClient;

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.DynamoDB({
      credentials,
      region,
    });

    this.documentClient = new aws.DynamoDB.DocumentClient({
      credentials,
      region,
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
      const response = await throttlingBackOff(() => this.documentClient.scan(props).promise());
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

  async getOutputValue(
    tableName: string,
    key: string,
    keyName: string = 'outputValue',
  ): Promise<dynamodb.AttributeValue | undefined> {
    const outputResponse = await this.getItem({
      Key: { id: { S: key } },
      TableName: tableName,
      AttributesToGet: [keyName],
    });
    if (!outputResponse.Item) {
      return;
    }
    return outputResponse.Item[keyName];
  }

  async createBackup(props: dynamodb.CreateBackupInput): Promise<void> {
    await throttlingBackOff(() => this.client.createBackup(props).promise());
  }
}
