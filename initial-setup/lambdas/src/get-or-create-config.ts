import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { PutFileEntry } from 'aws-sdk/clients/codecommit';
import { pretty } from '@aws-pbmm/common-lambda/lib/util/perttier';
import { getFormatedObject } from '@aws-pbmm/common-lambda/lib/util/utils';

interface GetOrCreateConfigInput {
  repositoryName: string;
  filePath: string;
  s3Bucket: string;
  s3FileName: string;
  branchName: string;
  acceleratorVersion?: string;
}

const codecommit = new CodeCommit();
const s3 = new S3();

export const handler = async (input: GetOrCreateConfigInput) => {
  console.log(`Get or Create Config from S3 file...`);
  console.log(JSON.stringify(input, null, 2));

  const { repositoryName, filePath, s3Bucket, s3FileName, branchName, acceleratorVersion } = input;
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
    const extension = filePath.split('.').slice(-1)[0];
    const format = extension === 'json' ? 'json' : 'yaml';
    const configString = configFile.fileContent.toString();
    const rawConfig = await prepareRawConfig({
      branchName,
      configString,
      repositoryName,
      s3Bucket,
      source: 'codecommit',
      format,
    });
    const putFiles: PutFileEntry[] = [];
    putFiles.push({
      // Will always be json irrespective of Config Format
      filePath: 'raw/config.json',
      fileContent: pretty(rawConfig.config, 'json'),
    });
    let configCommitId;
    try {
      configCommitId = await codecommit.commit({
        branchName,
        repositoryName,
        putFiles,
        commitMessage: `Updating Raw Config in SM`,
        parentCommitId: configFile.commitId,
      });
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`No Change in Configuration form Previous Execution`);
      } else {
        throw new Error(error);
      }
    }
    return {
      configRepositoryName: repositoryName,
      configFilePath: rawConfigPath,
      configCommitId: configCommitId || configFile.commitId,
      acceleratorVersion,
      configRootFilePath: filePath,
    };
  } catch (e) {
    if (e.code !== 'FileDoesNotExistException' && e.code !== 'CommitDoesNotExistException') {
      throw new Error(e);
    }

    // Retrieve file from S3 and push to Code Commit Config Repo
    console.log(`No config found in branch "${branchName}", creating one`);

    const configString = await s3.getObjectBodyAsString({
      Bucket: s3Bucket,
      Key: s3FileName,
    });

    const extension = s3FileName.split('.').slice(-1)[0];
    const format = extension === 'json' ? 'json' : 'yaml';

    const rawConfig = await prepareRawConfig({
      branchName,
      configString,
      repositoryName,
      s3Bucket,
      source: 's3',
      newRepo: true,
      format,
    });

    const putFiles: PutFileEntry[] = [];
    putFiles.push(
      ...rawConfig.loadFiles.map(f => ({
        fileContent: pretty(f.fileContent, format),
        filePath: f.filePath,
      })),
    );
    putFiles.push({
      filePath,
      fileContent: pretty(configString, format),
    });
    putFiles.push({
      filePath: 'raw/config.json',
      // Will always be JSOn irrespective of Config Format
      fileContent: pretty(rawConfig.config, 'json'),
    });

    const configCommitId = await codecommit.commit({
      branchName,
      repositoryName,
      putFiles,
      commitMessage: `Initial push through SM from S3 to CodeCommit`,
    });
    console.log(
      JSON.stringify(
        {
          configRepositoryName: repositoryName,
          configFilePath: rawConfigPath,
          configCommitId,
          acceleratorVersion,
          configRootFilePath: filePath,
        },
        null,
        2,
      ),
    );
    return {
      configRepositoryName: repositoryName,
      configFilePath: rawConfigPath,
      configCommitId,
      acceleratorVersion,
      configRootFilePath: filePath,
    };
  }
};

interface ConfigOutput {
  filePath: string;
  fileContent: string;
}

export async function prepareRawConfig(props: {
  configString: string;
  source: string;
  repositoryName: string;
  branchName: string;
  s3Bucket?: string;
  newRepo?: boolean;
  format: 'json' | 'yaml';
}): Promise<{
  config: string;
  loadFiles: ConfigOutput[];
}> {
  const loadFiles: ConfigOutput[] = [];
  const { configString, source, repositoryName, branchName, newRepo, s3Bucket, format } = props;
  const config = getFormatedObject(configString, format);
  const globalOptionsFile = config['global-options'];

  if (Object.keys(globalOptionsFile).includes('__LOAD')) {
    const key = globalOptionsFile.__LOAD;
    console.log(`Loading Global Options from ${source}`);
    const localConfig = await getConfigFromFile({
      source,
      branchName,
      filePath: key,
      repositoryName,
      s3Bucket,
    });
    config['global-options'] = getFormatedObject(localConfig, format);
    loadFiles.push({
      filePath: key,
      fileContent: localConfig,
    });
  }
  const mandatoryAccountsFile = config['mandatory-account-configs'];
  if (Object.keys(mandatoryAccountsFile).includes('__LOAD')) {
    const key = mandatoryAccountsFile.__LOAD;
    console.log(`Loading Mandatory Accounts from ${source}`);
    const localConfig = await getConfigFromFile({
      source,
      branchName,
      filePath: key,
      repositoryName,
      s3Bucket,
    });
    config['mandatory-account-configs'] = getFormatedObject(localConfig, format);
    loadFiles.push({
      filePath: key,
      fileContent: localConfig,
    });
  }
  const organizationalUnitsLoadConfig = config['organizational-units'];
  for (const key of Object.keys(organizationalUnitsLoadConfig)) {
    console.log(`Loading Organizational Units from ${source}`);
    if (Object.keys(organizationalUnitsLoadConfig[key]).includes('__LOAD')) {
      const filePath = organizationalUnitsLoadConfig[key].__LOAD;
      const localConfig = await getConfigFromFile({
        source,
        branchName,
        filePath,
        repositoryName,
        s3Bucket,
      });
      organizationalUnitsLoadConfig[key] = getFormatedObject(localConfig, format);
      loadFiles.push({
        filePath,
        fileContent: localConfig,
      });
    }
  }
  config['organizational-units'] = organizationalUnitsLoadConfig;

  if (Object.keys(config['workload-account-configs']).includes('__LOAD')) {
    console.log(`Loading WorkLoad Accounts from ${source}`);
    let workLoadAccountsConfig: { [accountKey: string]: string } = {};
    const workLoadAccountsFiles = config['workload-account-configs'].__LOAD;
    for (const workLoadAccountFile of workLoadAccountsFiles) {
      const localConfig = await getConfigFromFile({
        source,
        branchName,
        filePath: workLoadAccountFile,
        repositoryName,
        s3Bucket,
      });
      workLoadAccountsConfig = {
        ...workLoadAccountsConfig,
        ...getFormatedObject(localConfig, format),
      };
      loadFiles.push({
        filePath: workLoadAccountFile,
        fileContent: localConfig,
      });
    }
    config['workload-account-configs'] = workLoadAccountsConfig;
  }
  return {
    config: JSON.stringify(config),
    loadFiles,
  };
}

async function getConfigFromFile(props: {
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

// handler({
//   "repositoryName": "PBMMAccel-Config-Repo-Testing",
//   "filePath": "config.json",
//   "s3Bucket": "pbmmaccel-538235518685-ca-central-1-config",
//   "s3FileName": "config.json",
//   "branchName": "master"
// })
