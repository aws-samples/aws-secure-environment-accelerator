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
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

import {
  AttributeValue,
  BatchWriteItemCommandInput,
  CreateBackupCommandInput,
  CreateTableCommandInput,
  DeleteItemCommandInput,
  DocumentClient,
  DynamoDB as dynamodb,
  GetItemCommandInput,
  GetItemCommandOutput,
  PutItemCommandInput,
  ScanCommandInput,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';

export class DynamoDB {
  private readonly client: DynamoDB;
  readonly documentClient: DocumentClient;

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new dynamodb({
      credentials,
      region,
      logger: console,
    });

    this.documentClient = DynamoDBDocument.from(new dynamodb({
      credentials,
      region,
    }));
  }

  async createTable(props: CreateTableCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.createTable(props).promise());
  }

  async batchWriteItem(props: BatchWriteItemCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.batchWriteItem(props).promise());
  }

  async scan(props: ScanCommandInput): Promise<Array<Record<string, AttributeValue>>> {
    const items: Array<Record<string, AttributeValue>> = [];
    let token: Record<string, AttributeValue> | undefined;
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

  async putItem(props: PutItemCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.putItem(props).promise());
  }

  async getItem(props: GetItemCommandInput): Promise<GetItemCommandOutput> {
    return throttlingBackOff(() => this.client.getItem(props).promise());
  }

  async deleteItem(props: DeleteItemCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.deleteItem(props).promise());
  }

  async updateItem(props: UpdateItemCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.updateItem(props).promise());
  }

  async getOutputValue(
    tableName: string,
    key: string,
    keyName: string = 'outputValue',
  ): Promise<AttributeValue | undefined> {
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

  async createBackup(props: CreateBackupCommandInput): Promise<void> {
    await throttlingBackOff(() => this.client.createBackup(props).promise());
  }
}
