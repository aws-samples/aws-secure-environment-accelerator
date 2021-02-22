import { PutFileEntry } from 'aws-sdk/clients/codecommit';
import * as yaml from 'js-yaml';
import { S3 } from '../aws/s3';
import { CodeCommit } from '../aws/codecommit';
import { pretty, FormatType } from './prettier';
import { RAW_CONFIG_FILE, JSON_FORMAT } from './constants';
import { DynamoDB } from '../aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { ReplacementConfigValueType, ReplacementsConfig } from '@aws-accelerator/common-config';
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
    // Sending Root Config back
    loadConfigResponse.loadFiles.push({
      filePath: configFilePath,
      fileContent: pretty(configString, format),
    });

    // Sending Raw Config back
    loadConfigResponse.loadFiles.push({
      filePath: RAW_CONFIG_FILE,
      fileContent: pretty(
        replaceDefaults({
          config: getStringFromObject(loadConfigResponse.config, JSON_FORMAT),
          acceleratorName: this.props.acceleratorName,
          acceleratorPrefix: this.props.acceleratorPrefix,
          region: this.props.region,
          additionalReplacements: additionalReplacements(loadConfigResponse.config.replacements || {}),
        }),
        JSON_FORMAT,
      ),
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
    if (!ReplacementConfigValueType.is(value)) {
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
