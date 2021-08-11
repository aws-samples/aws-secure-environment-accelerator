import * as fs from 'fs';
import * as aws from 'aws-sdk';
import * as dynamodb from 'aws-sdk/clients/dynamodb';

const DEV_OUTPUTS_FILE_PATH = '../../../src/deployments/cdk/outputs.json';
const env = process.env;
const acceleratorPrefix = env.ACCELERATOR_PREFIX || 'ASEA-';
const documentClient = new aws.DynamoDB.DocumentClient();
export async function loadOutputs(tableName: string) {
  const outputs = [];
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
  for (const item of items) {
    const cVal = JSON.parse(item.outputValue as string);
    outputs.push(...cVal);
  }
  return outputs;
}

loadOutputs(`${acceleratorPrefix}Outputs`).then(outputs => {
  fs.writeFileSync(DEV_OUTPUTS_FILE_PATH, JSON.stringify(outputs, null, 2));
});
