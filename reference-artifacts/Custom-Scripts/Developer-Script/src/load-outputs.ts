import * as fs from 'fs';
import { CloudFormation, DescribeStacksCommandOutput } from '@aws-sdk/client-cloudformation';
import { CodeCommit } from '@aws-sdk/client-codecommit';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { AttributeValue, DynamoDB as dynamodb, ScanCommandInput } from '@aws-sdk/client-dynamodb';
import * as camelCase from 'camelcase';
const DEV_FILE_PATH = '../../../src/deployments/cdk/';
const DEV_OUTPUTS_FILE_PATH = `${DEV_FILE_PATH}outputs.json`;

const env = process.env;
const installerStackName = process.env.INSTALLER_STACK_NAME;
const cfn = new CloudFormation();
const documentClient = DynamoDBDocument.from(new dynamodb());
const codeCommitClient = new CodeCommit();

export const scanDDBTable = async (tableName: string) => {
  const items: Array<Record<string, AttributeValue>> = [];
  let token: Record<string, AttributeValue> | undefined;
  const props: ScanCommandInput = {
    TableName: tableName,
  };
  do {
    const response = await documentClient.scan(props);
    token = response.LastEvaluatedKey;
    props.ExclusiveStartKey = token!;
    items.push(...response.Items!);
  } while (token);

  return items;
};

export const loadOutputs = (items: Array<Record<string, AttributeValue>>) => {
  return items.reduce((outputList: any, item) => {
    const output = JSON.parse(item.outputValue as string);
    outputList.push(...output);
    return outputList;
  }, []);
};

export const loadConfigs = (items: Array<Record<string, AttributeValue>>) => {
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

export const describeStack = async (cfnClient: AWS.CloudFormation, stackName: string | undefined) => {
  if (!stackName) {
    throw new Error('Please set the environment variable for INSTALLER_STACK_NAME');
  }

  try {
    const describeStackParams = {
      StackName: stackName,
    };
    return cfnClient.describeStacks(describeStackParams).promise();
  } catch (err) {
    console.log(`Check to make sure the stack ${stackName} exists`);
    throw err;
  }
};

export const setContext = (stackInfo: DescribeStacksCommandOutput) => {
  const params = stackInfo.Stacks![0].Parameters;
  const context: any = {};
  if (params) {
    for (const param of params) {
      const key = camelCase(param.ParameterKey!);
      const value = param.ParameterValue!;
      context[key] = value;
    }
  }
  context['acceleratorExecutionRoleName'] = `${context.acceleratorPrefix}PipelineRole`;
  context['defaultRegion'] = process.env.AWS_REGION || 'us-west-2';
  context['acceleratorPipelineRoleName'] = `${context.acceleratorPrefix}PipelineRole`;
  context['acceleratorStateMachineName'] = `${context.acceleratorPrefix}MainStateMachine_sm`;
  context['installerVersion'] = '1.5.0';
  context['vpcCidrPoolAssignedTable'] = `${context.acceleratorPrefix}cidr-vpc-assign`;
  context['subnetCidrPoolAssignedTable'] = `${context.acceleratorPrefix}cidr-subnet-assign`;
  context['cidrPoolTable'] = `${context.acceleratorPrefix}cidr-pool`;
  console.log(JSON.stringify(context, null, 2));
  return context;
};

(async function () {
  const stackInfo = await describeStack(cfn, installerStackName);
  const context = setContext(stackInfo);

  const outputs = await scanDDBTable(`${context.acceleratorPrefix}Outputs`);
  const parsedOutputs = loadOutputs(outputs);

  const params = await scanDDBTable(`${context.acceleratorPrefix}Parameters`);
  const configs = loadConfigs(params);

  const configFileBase64 = await codeCommitClient
    .getFile(
    { repositoryName: context.configRepositoryName, filePath: 'raw/config.json' },
  );
  const configFile = configFileBase64.fileContent.toString();

  fs.writeFileSync(`${DEV_FILE_PATH}context.json`, JSON.stringify(context, null, 2));
  fs.writeFileSync(DEV_OUTPUTS_FILE_PATH, JSON.stringify(parsedOutputs, null, 2));
  fs.writeFileSync(`${DEV_FILE_PATH}config.json`, configFile);
  writeConfigs(configs);
})();
