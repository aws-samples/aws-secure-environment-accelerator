import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { config } from 'aws-sdk';
import { PutFileEntry } from 'aws-sdk/clients/codecommit';

interface GetOrCreateConfigInput {
  repositoryName: string;
  filePath: string;
  s3Bucket: string;
  s3FileName: string;
  branchName: string;
}

const codecommit = new CodeCommit();
const s3 = new S3();

export const handler = async (input: GetOrCreateConfigInput) => {
  // console.log(`Get or Create Config from S3 file...`);
  // console.log(JSON.stringify(input, null, 2));

  const { repositoryName, filePath, s3Bucket, s3FileName, branchName } = input;
  const s3FilePaths = s3FileName.split('/');
  const s3ConfigPaths = s3FilePaths.slice(0, s3FilePaths.length - 1);
  const configRootPath = `${s3ConfigPaths.join('/')}`;
  const rawConfigPath = 'raw/config.json';

  const configRepository = await codecommit.batchGetRepositories([repositoryName]);
  if (!configRepository.repositories || configRepository.repositories?.length === 0) {
    console.log(`Creating repository "${repositoryName}" for Config file`);
    await codecommit.createRepository(repositoryName, 'This repository contains configuration');
    console.log(`Creation of repository "${repositoryName}" is done for Config file`);
  }

  console.log(`Retrieving config file from config Repo`);
  try {
    // TODO Get previous commit in order to compare config files
    console.log(`Trying to retrieve existing config from branch "${branchName}"`);
    const configFile = await codecommit.getFile(repositoryName, filePath, branchName);
    const configString = configFile.fileContent.toString();
    const rawConfig = await prepareRawConfig({
      branchName,
      configRootPath,
      configString,
      repositoryName,
      s3Bucket,
      source: 'codecommit',
    });
    return {
      configRepositoryName: repositoryName,
      configFilePath: rawConfigPath,
      configCommitId: '',
    };
  } catch (e) {
    if (e.code !== 'FileDoesNotExistException' && e.code !== 'CommitDoesNotExistException') {
      throw new Error(e);
    }

    // Retrieve file from S3 and push to Code Commit Config Repo
    console.log(`No config found in branch "${branchName}", creating one`);
    const s3 = new S3();
    
    const configString = await s3.getObjectBodyAsString({
      Bucket: s3Bucket,
      Key: s3FileName,
    });

    const rawConfig = await prepareRawConfig({
      branchName,
      configRootPath,
      configString,
      repositoryName,
      s3Bucket,
      source: 's3',
      newRepo: true,
    });

    const putFiles: PutFileEntry[] = [];
    putFiles.push(...rawConfig.loadFiles);
    putFiles.push({
      filePath: 'raw/config.json',
      fileContent: rawConfig.config,
    });

    await codecommit.commit({
      branchName,
      repositoryName,
      putFiles: putFiles
    });

    return {
      configRepositoryName: repositoryName,
      configFilePath: rawConfigPath,
      configCommitId: '',
    };
  }
};

interface ConfigOutput {
  filePath: string;
  fileContent: string;
}
export async function prepareRawConfig(props: {
  configString: string; 
  configRootPath: string; 
  source : string;
  repositoryName: string;
  branchName: string;
  s3Bucket?: string;
  newRepo?: boolean;
}): Promise<{
  config: string;
  loadFiles: ConfigOutput[];
}> {
  const loadFiles: ConfigOutput[] = [];
  const { configRootPath, configString, source, repositoryName, branchName, newRepo, s3Bucket } = props;
  const config = JSON.parse(configString);
  const globalOptionsFile = config['global-options'];

  if (Object.keys(globalOptionsFile).includes('__LOAD')) {
    const key = `${configRootPath}${globalOptionsFile['__LOAD']}`;
    console.log(`Loading Global Options from ${source}`);
    const localConfig = await getConfigFromFile({
      source,
      branchName,
      filePath: key,
      repositoryName,
      s3Bucket,
    });
    config['global-options'] = JSON.parse(localConfig);
    loadFiles.push({
      filePath: key,
      fileContent: localConfig,
    });
  }
  const mandatoryAccountsFile = config['mandatory-account-configs'];
  if (Object.keys(mandatoryAccountsFile).includes('__LOAD')) {
    const key = `${configRootPath}${mandatoryAccountsFile['__LOAD']}`;
    console.log(`Loading Mandatory Accounts from ${source}`);
    const localConfig = await getConfigFromFile({
      source,
      branchName,
      filePath: key,
      repositoryName,
      s3Bucket,
    });
    config['mandatory-account-configs'] = JSON.parse(localConfig);
    loadFiles.push({
      filePath: key,
      fileContent: localConfig,
    });
  }
  const organizationalUnitsLoadConfig = config['organizational-units'];
  for (const key of Object.keys(organizationalUnitsLoadConfig)) {
    console.log(`Loading Organizational Units from ${source}`);
    if (Object.keys(organizationalUnitsLoadConfig[key]).includes('__LOAD')) {
      const filePath = `${configRootPath}${organizationalUnitsLoadConfig[key]['__LOAD']}`;
      const localConfig = await getConfigFromFile({
        source,
        branchName,
        filePath,
        repositoryName,
        s3Bucket,
      });
      organizationalUnitsLoadConfig[key] = JSON.parse((localConfig));
      loadFiles.push({
        filePath,
        fileContent: localConfig,
      });
    }
  }
  config['organizational-units'] = organizationalUnitsLoadConfig;

  if (Object.keys(config['workload-account-configs']).includes('__LOAD')) {
    console.log(`Loading WorkLoad Accounts from ${source}`);
    let workLoadAccountsConfig: { [accountKey: string] : string } = {};
    const workLoadAccountsFiles = config['workload-account-configs']['__LOAD'];
    for (const workLoadAccountFile of workLoadAccountsFiles) {
      const filePath = `${configRootPath}${workLoadAccountFile}`;
      const localConfig = await getConfigFromFile({
        source,
        branchName,
        filePath,
        repositoryName,
        s3Bucket,
      });
      workLoadAccountsConfig = {
        ...workLoadAccountsConfig,
        ...JSON.parse(localConfig),        
      }
      loadFiles.push({
        filePath,
        fileContent: localConfig,
      });
    }
    config['workload-account-configs'] = workLoadAccountsConfig;
  }
  return {
    config: JSON.stringify(config, null, 2),
    loadFiles,
  }
}

async function getConfigFromFile (props: {
  source: string; 
  filePath: string; 
  repositoryName: string;
  branchName: string;
  s3Bucket?: string;
}) {
  const { source, branchName, filePath, repositoryName, s3Bucket } = props;
  let config;
  if (source === 's3') {
    console.log(`Reading file ${filePath} from Bucket ${s3Bucket}`);
    const configString = await s3.getObjectBodyAsString({
      Bucket: s3Bucket!,
      Key: filePath,
    });
    config = configString;
  } else {
    console.log(`Reading file ${filePath} from Repository ${repositoryName}`);
    const configResponse = await codecommit.getFile(repositoryName, filePath, branchName);
    config = configResponse.fileContent.toString();
  }
  return config;
}


handler({
  "repositoryName": "PBMMAccel-Repo-Config",
  "filePath": "config.json",
  "s3Bucket": "pbmmaccel-131599432352-ca-central-1-config",
  "s3FileName": "config.json",
  "branchName": "master"
});