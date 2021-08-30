import * as fs from 'fs';
import * as aws from 'aws-sdk';
import * as dynamodb from 'aws-sdk/clients/dynamodb';
import { resourceLimits } from 'node:worker_threads';
const DEV_FILE_PATH = '../../../src/deployments/cdk/';
const DEV_OUTPUTS_FILE_PATH = `${DEV_FILE_PATH}outputs.json`;

const env = process.env;
const acceleratorPrefix = env.ACCELERATOR_PREFIX || 'ASEA-';
const documentClient = new aws.DynamoDB.DocumentClient();

export const scanDDBTable = async (tableName: string) => {
  const items: dynamodb.ItemList = [];
  let token: dynamodb.Key | undefined;
  const props: dynamodb.ScanInput = {
    TableName: tableName,
  };
  do {
    const response = await documentClient.scan(props).promise();
    token = response.LastEvaluatedKey;
    props.ExclusiveStartKey = token!;
    items.push(...response.Items!);
  } while (token);

  return items;
};

export const loadOutputs = (items: dynamodb.ItemList) => {
  return items.reduce((outputList: any, item) => {
    const output = JSON.parse(item.outputValue as string);
    outputList.push(...output);
    return outputList;
  }, []);
};

export const loadConfigs = (items: dynamodb.ItemList) => {
  return items.map(item => {
    return { id: item.id, value: JSON.parse(item.value as string) };
  });
};

export const writeConfigs = (configList: any) => {
  for (const config of configList) {
    if (config.id.includes('accounts/0')) {
      config.id = 'accounts';
    }
    if (config.id !== 'accounts-items-count') {
      fs.writeFileSync(`${DEV_FILE_PATH}${config.id}.json`, JSON.stringify(config.value, null, 2));
    }
  }
};
scanDDBTable(`${acceleratorPrefix}Outputs`)
  .then(outputs => loadOutputs(outputs))
  .then(parsedOutputs => fs.writeFileSync(DEV_OUTPUTS_FILE_PATH, JSON.stringify(parsedOutputs, null, 2)));

scanDDBTable(`${acceleratorPrefix}Parameters`)
  .then(params => loadConfigs(params))
  .then(configs => writeConfigs(configs));
