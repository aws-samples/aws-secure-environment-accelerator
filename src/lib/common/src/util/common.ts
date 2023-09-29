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

import { PutFileEntry } from 'aws-sdk/clients/codecommit';
import * as yaml from 'js-yaml';
import { S3 } from '../aws/s3';
import { CodeCommit } from '../aws/codecommit';
import { pretty, FormatType } from './prettier';
import { RAW_CONFIG_FILE, JSON_FORMAT } from './constants';
import { DynamoDB } from '../aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { AssignedVpcCidrPool, AssignedSubnetCidrPool, CidrPool } from '@aws-accelerator/common-outputs/src/cidr-pools';
import { ReplacementObject, ReplacementsConfig } from '@aws-accelerator/common-config';
import { string as StringType } from 'io-ts';

const GLOBAL_REGION = 'us-east-1';
export function getFormattedObject(input: string, format: FormatType) {
  if (!input || input === '') {
    return {};
  }
  if (format === JSON_FORMAT) {
    return JSON.parse(input);
  }
  return yaml.load(input);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStringFromObject(input: any, format: FormatType) {
  if (format === JSON_FORMAT) {
    return JSON.stringify(input, null, 2);
  }
  return yaml.dump(input);
}

interface RawConfigProps {
  configFilePath: string;
  source: string;
  repositoryName: string;
  branchName: string;
  format: FormatType;
  region: string;
  acceleratorPrefix: string;
  acceleratorName: string;
  s3Bucket?: string;
}

interface RawConfigOutput {
  config: string;
  loadFiles: PutFileEntry[];
}

export class RawConfig {
  private readonly codecommit: CodeCommit;
  private readonly s3: S3;
  private readonly props: RawConfigProps;
  constructor(props: RawConfigProps) {
    this.props = props;
    this.codecommit = new CodeCommit(undefined, this.props.region);
    this.s3 = new S3();
  }

  async prepare(): Promise<RawConfigOutput> {
    const loadFiles: PutFileEntry[] = [];
    const { configFilePath, format } = this.props;
    const configString = await this.getFromFile(configFilePath);
    const config = getFormattedObject(configString, format);
    const loadConfigResponse = await this.load(config, loadFiles);

    let updatedRawConfig = replaceDefaults({
      config: getStringFromObject(loadConfigResponse.config, JSON_FORMAT),
      acceleratorName: this.props.acceleratorName,
      acceleratorPrefix: this.props.acceleratorPrefix,
      region: this.props.region,
      additionalReplacements: additionalReplacements(loadConfigResponse.config.replacements || {}),
    });

    updatedRawConfig = await vpcReplacements({
      rawConfigStr: updatedRawConfig,
    });

    const updatedConfigs = enableGlobalRegion(configString, updatedRawConfig, format);
    // Sending Raw Config back
    loadConfigResponse.loadFiles.push({
      filePath: RAW_CONFIG_FILE,
      fileContent: pretty(updatedConfigs.rawConfigStr, JSON_FORMAT),
    });

    // Sending Root Config back
    loadConfigResponse.loadFiles.push({
      filePath: configFilePath,
      fileContent: pretty(updatedConfigs.configStr, format),
    });
    return {
      config: JSON.stringify(loadConfigResponse.config),
      loadFiles: loadConfigResponse.loadFiles,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async load(configElement: any, loadFiles: PutFileEntry[]) {
    if (configElement.__LOAD) {
      if (typeof configElement.__LOAD === 'string') {
        console.log(`Loading file : ${configElement.__LOAD}`);
        const tempConfig = await this.getFromFile(configElement.__LOAD);
        if (!loadFiles.find(ldf => ldf.filePath === configElement.__LOAD)) {
          loadFiles.push({
            filePath: configElement.__LOAD,
            fileContent: pretty(tempConfig, this.props.format),
          });
        }
        delete configElement.__LOAD;
        const tempConfigFormatted = getFormattedObject(tempConfig, this.props.format);
        if (Array.isArray(tempConfigFormatted)) {
          configElement = tempConfigFormatted;
        } else {
          configElement = {
            ...configElement,
            ...tempConfigFormatted,
          };
        }
      } else {
        for (const filename of configElement.__LOAD) {
          const tempConfig = await this.getFromFile(filename);
          if (!loadFiles.find(ldf => ldf.filePath === filename)) {
            loadFiles.push({
              filePath: filename,
              fileContent: pretty(tempConfig, this.props.format),
            });
          }
          configElement = {
            ...configElement,
            ...getFormattedObject(tempConfig, this.props.format),
          };
        }
        delete configElement.__LOAD;
      }
    }
    for (const element of Object.keys(configElement)) {
      if (typeof configElement[element] === 'object') {
        const loadConfigResponse = await this.load(configElement[element], loadFiles);
        configElement[element] = loadConfigResponse.config;
        loadFiles = loadConfigResponse.loadFiles;
      }
    }
    return {
      config: configElement,
      loadFiles,
    };
  }

  async getFromFile(filePath: string) {
    const { source, branchName, repositoryName, s3Bucket } = this.props;
    if (source === 's3') {
      console.log(`Reading file ${filePath} from Bucket ${s3Bucket}`);
      const configString = await this.s3.getObjectBodyAsString({
        Bucket: s3Bucket!,
        Key: filePath,
      });
      return configString;
    }
    console.log(`Reading file ${filePath} from Repository ${repositoryName}`);
    const configResponse = await this.codecommit.getFile(repositoryName, filePath, branchName);
    return configResponse.fileContent.toString();
  }
}

export function equalIgnoreCase(value1: string, value2: string): boolean {
  return value1.toLowerCase() === value2.toLowerCase();
}

export async function loadAccounts(tableName: string, client: DynamoDB): Promise<Account[]> {
  let index = 0;
  const accounts: Account[] = [];
  if (!client) {
    client = new DynamoDB();
  }
  while (true) {
    const itemsInput = {
      TableName: tableName,
      Key: { id: { S: `accounts/${index}` } },
    };
    const item = await client.getItem(itemsInput);
    if (index === 0 && !item.Item) {
      throw new Error(`Cannot find parameter with ID "accounts"`);
    }

    if (!item.Item) {
      break;
    }
    accounts.push(...JSON.parse(item.Item.value.S!));
    index++;
  }
  return accounts;
}

export function additionalReplacements(configReplacements: ReplacementsConfig): { [key: string]: string | string[] } {
  const replacements: { [key: string]: string | string[] } = {};
  for (const [key, value] of Object.entries(configReplacements)) {
    if (!ReplacementObject.is(value)) {
      if (StringType.is(value)) {
        replacements['\\${' + key.toUpperCase() + '}'] = value;
      } else {
        replacements['"?\\${' + key.toUpperCase() + '}"?'] = value;
      }
    } else {
      for (const [needle, replacement] of Object.entries(value)) {
        if (StringType.is(replacement)) {
          replacements['\\${' + key.toUpperCase() + '_' + needle.toUpperCase() + '}'] = replacement;
        } else {
          replacements['"?\\${' + key.toUpperCase() + '_' + needle.toUpperCase() + '}"?'] = replacement;
        }
      }
    }
  }
  return replacements;
}

export function replaceDefaults(props: {
  config: string;
  acceleratorPrefix: string;
  acceleratorName: string;
  region: string;
  additionalReplacements: { [key: string]: string | string[] };
  orgAdminRole?: string;
}) {
  const { acceleratorName, acceleratorPrefix, additionalReplacements, region, orgAdminRole } = props;
  let { config } = props;
  const accelPrefixNd = acceleratorPrefix.endsWith('-') ? acceleratorPrefix.slice(0, -1) : acceleratorPrefix;
  for (const [key, value] of Object.entries(additionalReplacements)) {
    config = config.replace(new RegExp(key, 'g'), StringType.is(value) ? value : JSON.stringify(value));
  }

  /* eslint-disable no-template-curly-in-string */
  const replacements = {
    '\\${HOME_REGION}': region,
    '\\${GBL_REGION}': GLOBAL_REGION,
    '\\${ACCELERATOR_NAME}': acceleratorName,
    '\\${ACCELERATOR_PREFIX}': acceleratorPrefix,
    '\\${ACCELERATOR_PREFIX_ND}': accelPrefixNd,
    '\\${ACCELERATOR_PREFIX_LND}': accelPrefixNd.toLowerCase(),
    '\\${ORG_ADMIN_ROLE}': orgAdminRole!,
  };
  /* eslint-enable */

  Object.entries(replacements).map(([key, value]) => {
    config = config.replace(new RegExp(key, 'g'), value);
  });
  return config;
}

/**
 * Dynamic VPC Replacements
 * @param rawConfigStr
 * @returns
 */
export async function vpcReplacements(props: { rawConfigStr: string }): Promise<string> {
  const { rawConfigStr } = props;
  /* eslint-disable no-template-curly-in-string */
  const ouOrAccountReplacementRegex = '\\${CONFIG::OU_NAME}';
  const vpcConfigSections = ['workload-account-configs', 'mandatory-account-configs', 'organizational-units'];
  const rawConfig = JSON.parse(rawConfigStr);
  const existingVpcConfigSections = vpcConfigSections.filter(vpcConfigSection => rawConfig[vpcConfigSection]);
  if (existingVpcConfigSections.length < vpcConfigSections.length) {
    console.log('Expected the following keys to exist', vpcConfigSections);
    console.log('Only found the following keys', existingVpcConfigSections);
    throw new Error('Please add the missing manditory sections to the configuration file.');
  }
  for (const vpcConfigSection of existingVpcConfigSections) {
    Object.entries(rawConfig[vpcConfigSection]).map(([key, _]) => {
      const replacements = {
        '\\${CONFIG::VPC_NAME}': key,
        '\\${CONFIG::VPC_NAME_L}': key.toLowerCase(),
        '\\${CONFIG::OU_NAME}': key,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [index, vpcConfig] of Object.entries(rawConfig[vpcConfigSection][key].vpc || []) as [string, any]) {
        vpcConfig.name = vpcConfig.name.replace(new RegExp(ouOrAccountReplacementRegex, 'g'), key);
        let vpcConfigStr = JSON.stringify(vpcConfig);
        for (const [key, value] of Object.entries(replacements)) {
          vpcConfigStr = vpcConfigStr.replace(new RegExp(key, 'g'), value);
        }
        rawConfig[vpcConfigSection][key].vpc[index] = JSON.parse(vpcConfigStr);
      }
    });
  }
  /* eslint-enable */

  return getStringFromObject(rawConfig, JSON_FORMAT);
}

export async function loadAssignedVpcCidrPool(tableName: string, client?: DynamoDB) {
  console.log('In loadAssignedVpcCidrPool');
  if (!client) {
    client = new DynamoDB();
  }
  const assignedVpcCidrPools = await client.scan({
    TableName: tableName,
  });
  console.log('Finished loadAssignedVpcCidrPool');
  return (assignedVpcCidrPools as unknown) as AssignedVpcCidrPool[];
}

export async function loadAssignedSubnetCidrPool(tableName: string, client?: DynamoDB) {
  console.log('In loadAssignedSubnetCidrPool');
  if (!client) {
    client = new DynamoDB();
  }
  const assignedSubnetCidrPools = await client.scan({
    TableName: tableName,
  });
  return (assignedSubnetCidrPools as unknown) as AssignedSubnetCidrPool[];
}

export async function loadCidrPools(tableName: string, client?: DynamoDB): Promise<CidrPool[]> {
  console.log('In loadCidrPools');
  if (!client) {
    client = new DynamoDB();
  }
  const cidrPools = await client.scan({
    TableName: tableName,
  });
  return (cidrPools as unknown) as CidrPool[];
}

export function randomAlphanumericString(length: number) {
  const numbers = Math.random().toString(11).slice(2);
  const chars = randomString(length - 2);
  return numbers.slice(0, 2) + chars;
}

function randomString(length: number, charSet?: string) {
  charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let randomString = '';
  for (let i = 0; i < length; i++) {
    randomString += charSet.charAt(Math.floor(Math.random() * charSet.length));
  }
  return randomString;
}

function enableGlobalRegion(config: string, rawConfig: string, format: FormatType) {
  const rawConfigObj = getFormattedObject(rawConfig, format);
  const configObj = getFormattedObject(config, format);
  if (!rawConfigObj['global-options']['supported-regions'].includes('us-east-1')) {
    console.log('us-east-1 is not inlcuded in supported-regions. Adding.');
    configObj['global-options']['supported-regions'].push('us-east-1');
    rawConfigObj['global-options']['supported-regions'].push('us-east-1');
  } else {
    console.log('Global region is added.');
  }

  const configStr = getStringFromObject(configObj, format);
  const rawConfigStr = getStringFromObject(rawConfigObj, JSON_FORMAT);
  return { configStr, rawConfigStr };
}
