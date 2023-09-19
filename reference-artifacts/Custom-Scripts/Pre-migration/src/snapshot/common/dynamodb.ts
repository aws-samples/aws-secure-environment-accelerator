/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import {
  DynamoDBClient,
  CreateTableCommand,
  CreateTableCommandInput,
  DeleteTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  ScanCommandInput,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  paginateScan,
  DynamoDBDocumentPaginationConfiguration,
} from '@aws-sdk/lib-dynamodb';

import { throttlingBackOff } from '../../common/aws/backoff';
import { DbWrite, ResourceData, TableKey, TableKeys } from './types';

let dynamodbClient: DynamoDBClient;
let tableName: string | undefined = undefined;

export class TableOperations {
  constructor(dbTableName: string, region: string) {
    tableName = dbTableName;
    dynamodbClient = new DynamoDBClient({ region: region });
  }

  public async createTable(): Promise<void> {
    let tableExists = true;

    try {
      await throttlingBackOff(() => dynamodbClient.send(new DescribeTableCommand({ TableName: tableName })));
    } catch (e: any) {
      if (e instanceof ResourceNotFoundException) {
        tableExists = false;
      } else {
        console.log(`Error: ${JSON.stringify(e)}`);
        throw new Error('Unable to check for existing DynamoDb table');
      }
    }
    if (tableExists) {
      return;
    }

    const tableInput: CreateTableCommandInput = {
      TableName: tableName,
      AttributeDefinitions: [
        {
          AttributeName: 'AccountRegion',
          AttributeType: 'S',
        },
        {
          AttributeName: 'ResourceName',
          AttributeType: 'S',
        },
      ],
      KeySchema: [
        {
          AttributeName: 'AccountRegion',
          KeyType: 'HASH',
        },
        {
          AttributeName: 'ResourceName',
          KeyType: 'RANGE',
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      TableClass: 'STANDARD_INFREQUENT_ACCESS',
    };
    try {
      console.log(`Creating DynamoDb table named ${tableName}`);
      await throttlingBackOff(() => dynamodbClient.send(new CreateTableCommand(tableInput)));
    } catch (e) {
      console.log(`Error: ${JSON.stringify(e)}`);
      throw new Error('Unable to create DynamoDb table');
    }

    // wait for table creation to complete
    let tableStatus = 'CREATING';
    while (tableStatus !== 'ACTIVE') {
      console.log('Waiting for table to be active');
      const describeTableResults = await throttlingBackOff(() =>
        dynamodbClient.send(new DescribeTableCommand({ TableName: tableName })),
      );
      tableStatus = describeTableResults.Table?.TableStatus!;
      await sleep(15000);
    }
  }

  public async writeResource(data: DbWrite): Promise<void> {
    if (data.preMigration) {
      const params: UpdateItemCommandInput = {
        TableName: tableName,
        Key: {
          AccountRegion: { S: `${data.accountId}:${data.region}` },
          ResourceName: { S: `${data.resourceName}` },
        },
        UpdateExpression: 'SET PreMigrationJson = :preMigrationJson, PreMigrationHash = :preMigrationHash',
        ExpressionAttributeValues: {
          ':preMigrationJson': { S: data.data.jsonData },
          ':preMigrationHash': { S: data.data.hash },
        },
      };
      await throttlingBackOff(() => dynamodbClient.send(new UpdateItemCommand(params)));
    } else {
      const params: UpdateItemCommandInput = {
        TableName: tableName,
        Key: {
          AccountRegion: { S: `${data.accountId}:${data.region}` },
          ResourceName: { S: `${data.resourceName}` },
        },
        UpdateExpression: 'SET PostMigrationJson = :postMigrationJson, PostMigrationHash = :postMigrationHash',
        ExpressionAttributeValues: {
          ':postMigrationJson': { S: data.data.jsonData },
          ':postMigrationHash': { S: data.data.hash },
        },
      };
      await throttlingBackOff(() => dynamodbClient.send(new UpdateItemCommand(params)));
    }
    console.log(`Snapshot written for ${data.accountId}:${data.region} resource ${data.resourceName}`);
  }

  public async getChangedKeys(): Promise<TableKeys> {
    const documentClient = DynamoDBDocumentClient.from(dynamodbClient);
    const paginatorConfig: DynamoDBDocumentPaginationConfiguration = {
      client: documentClient,
      pageSize: 50,
    };
    const params: ScanCommandInput = {
      TableName: tableName,
      Select: 'SPECIFIC_ATTRIBUTES',
      ProjectionExpression: 'AccountRegion,ResourceName,PreMigrationHash,PostMigrationHash,PreMigrationConfig',
    };
    const paginator = paginateScan(paginatorConfig, params);
    const keys: TableKeys = [];
    for await (const page of paginator) {
      for (const item of page.Items!) {
        if (item.PreMigrationHash !== item.PostMigrationHash &&
          item.PreMigrationHash &&
          item.PreMigrationConfig !== '[]' &&
          item.PreMigrationConfig !== '{}' &&
          !item.ResourceName.startsWith('cloudwatch-log-group') &&
          !item.ResourceName.startsWith('subscription-filters')) {
          keys.push({ hashKey: item.AccountRegion, sortKey: item.ResourceName });
        }
      }
    }
    return keys;
  }

  public async getDataForKey(tableKey: TableKey): Promise<ResourceData> {
    const documentClient = DynamoDBDocumentClient.from(dynamodbClient);
    const params: GetCommandInput = {
      TableName: tableName,
      Key: {
        AccountRegion: tableKey.hashKey,
        ResourceName: tableKey.sortKey,
      },
      AttributesToGet: ['PreMigrationJson', 'PostMigrationJson'],
    };
    const results = await throttlingBackOff(() => documentClient.send(new GetCommand(params)));
    return {
      accountRegion: tableKey.hashKey,
      resourceName: tableKey.sortKey,
      preMigrationConfig: results.Item!.PreMigrationJson ?? '{}',
      postMigrationConfig: results.Item!.PostMigrationJson ?? '{}',
    };
  }
}

export class Reset {
  constructor(dbTableName: string, region: string) {
    tableName = dbTableName;
    dynamodbClient = new DynamoDBClient({ region: region });
  }

  public async dropTable(): Promise<void> {
    await throttlingBackOff(() => dynamodbClient.send(new DeleteTableCommand({ TableName: tableName })));
  }
}

async function sleep(ms: number) {
  return new Promise((f) => setTimeout(f, ms));
}
