import * as fs from 'fs';
import * as aws from 'aws-sdk';
import * as dynamodb from 'aws-sdk/clients/dynamodb';
import * as camelCase from 'camelcase';
const DEV_FILE_PATH = '../../../src/deployments/cdk/';
const DEV_OUTPUTS_FILE_PATH = `${DEV_FILE_PATH}outputs.json`;

const env = process.env;
const acceleratorPrefix = env.ACCELERATOR_PREFIX || 'ASEA-';
const installerStackName = process.env.INSTALLER_STACK_NAME;
const cfn = new aws.CloudFormation();
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

const context: any = {};

describeStack(cfn, installerStackName)
  .then(stackInfo => {
    const params = stackInfo.Stacks![0].Parameters;
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
  })
  .then(context => fs.writeFileSync(`${DEV_FILE_PATH}context.json`, JSON.stringify(context, null, 2)));

scanDDBTable(`${acceleratorPrefix}Outputs`)
  .then(outputs => loadOutputs(outputs))
  .then(parsedOutputs => fs.writeFileSync(DEV_OUTPUTS_FILE_PATH, JSON.stringify(parsedOutputs, null, 2)));

scanDDBTable(`${acceleratorPrefix}Parameters`)
  .then(params => loadConfigs(params))
  .then(configs => writeConfigs(configs));
