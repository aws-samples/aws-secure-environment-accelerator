import { PutFileEntry } from 'aws-sdk/clients/codecommit';
import * as yaml from 'js-yaml';
import { S3 } from '../aws/s3';
import { CodeCommit } from '../aws/codecommit';
import { pretty, FormatType } from './prettier';
import { RAW_CONFIG_FILE, JSON_FORMAT } from './constants';
import { DynamoDB } from '../aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

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
  s3Bucket?: string;
  region?: string;
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
      fileContent: pretty(getStringFromObject(loadConfigResponse.config, JSON_FORMAT), JSON_FORMAT),
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
  while (true) {
    const itemsInput = {
      TableName: tableName,
      Key: { id: { S: `accounts/${index}` } },
    };
    const item = await new DynamoDB().getItem(itemsInput);
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
