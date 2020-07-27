import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { config } from 'aws-sdk';

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
  // console.log(`Get or Create Config from S3 file...`);
  // console.log(JSON.stringify(input, null, 2));

  const { repositoryName, filePath, s3Bucket, s3FileName, branchName, acceleratorVersion } = input;
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

    const currentCommit = await codecommit.getBranch(repositoryName, branchName);
    let commitId = currentCommit.branch?.commitId;
    try {
      const commit = await codecommit.putFile({
        branchName,
        repositoryName,
        filePath: rawConfigPath,
        fileContent: rawConfig,
        parentCommitId: commitId,
        commitMessage: `Initial raw configuration file generated from s3://${s3Bucket}/${s3FileName}`,
      });
      commitId = commit.commitId;
    } catch (e) {
      if (e.code === 'SameFileContentException') {
        console.log(`Nothing changed in configuration`);
      } else {
        throw new Error(e);
      }
    }

    return {
      configRepositoryName: repositoryName,
      configFilePath: filePath,
      configCommitId: configFile.commitId,
      acceleratorVersion,
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

    // Push Root config file to repository
    const currentCommit = await codecommit.getBranch(repositoryName, branchName);
    const commit = await codecommit.putFile({
      branchName,
      repositoryName,
      filePath,
      fileContent: configString,
      parentCommitId: currentCommit.branch?.commitId,
      commitMessage: `Initial Root configuration file copied from s3://${s3Bucket}/${s3FileName}`,
    });
    
    const rawCommit = await codecommit.putFile({
      branchName,
      repositoryName,
      filePath: rawConfigPath,
      fileContent: rawConfig,
      parentCommitId: commit.commitId,
      commitMessage: `Initial Raw configuration file generated from s3://${s3Bucket}/${s3FileName}`,
    });

    console.log(`CommitID for config file is "${rawCommit.commitId}"`);

    // Remove the S3 config object
    await s3.deleteObject({
      Bucket: s3Bucket,
      Key: s3FileName,
    });

    return {
      configRepositoryName: repositoryName,
      configFilePath: filePath,
      configCommitId: commit.commitId,
      acceleratorVersion,
    };
  }
};

export async function prepareRawConfig(props: {
  configString: string; 
  configRootPath: string; 
  source : string;
  repositoryName: string;
  branchName: string;
  s3Bucket?: string;
  newRepo?: boolean;
}): Promise<string> {
  const { configRootPath, configString, source, repositoryName, branchName, newRepo, s3Bucket } = props;
  const config = JSON.parse(configString);
  const globalOptionsFile = config['global-options'];

  if (Object.keys(globalOptionsFile).includes('__LOAD')) {
    console.log(`Loading Global Options from ${source}`);
    const localConfig = await getConfigFromFile({
      source,
      branchName,
      filePath: `${configRootPath}${globalOptionsFile['__LOAD']}`,
      repositoryName,
      s3Bucket,
      newRepo,
    });
    config['global-options'] = localConfig;
  }
  const mandatoryAccountsFile = config['mandatory-account-configs'];
  if (Object.keys(mandatoryAccountsFile).includes('__LOAD')) {
    console.log(`Loading Mandatory Accounts from ${source}`);
    const localConfig = await getConfigFromFile({
      source,
      branchName,
      filePath: `${configRootPath}${mandatoryAccountsFile['__LOAD']}`,
      repositoryName,
      s3Bucket,
      newRepo,
    });
    config['mandatory-account-configs'] = localConfig;
  }
  const organizationalUnitsLoadConfig = config['organizational-units'];
  for (const key of Object.keys(organizationalUnitsLoadConfig)) {
    console.log(`Loading Organizational Units from ${source}`);
    if (Object.keys(organizationalUnitsLoadConfig[key]).includes('__LOAD')) {
      const localConfig = await getConfigFromFile({
        source,
        branchName,
        filePath: `${configRootPath}${organizationalUnitsLoadConfig[key]['__LOAD']}`,
        repositoryName,
        s3Bucket,
        newRepo,
      });
      organizationalUnitsLoadConfig[key] = localConfig;
    }
  }
  config['organizational-units'] = organizationalUnitsLoadConfig;

  if (Object.keys(config['workload-account-configs']).includes('__LOAD')) {
    console.log(`Loading WorkLoad Accounts from ${source}`);
    let workLoadAccountsConfig: { [accountKey: string] : string } = {};
    const workLoadAccountsFiles = config['workload-account-configs']['__LOAD'];
    for (const workLoadAccountFile of workLoadAccountsFiles) {
      // console.log(workLoadAccountFile);
      const localConfig = await getConfigFromFile({
        source,
        branchName,
        filePath: `${configRootPath}${workLoadAccountFile}`,
        repositoryName,
        s3Bucket,
        newRepo,
      });
      workLoadAccountsConfig = {
        ...workLoadAccountsConfig,
        ...localConfig,
      }
    }
    config['workload-account-configs'] = workLoadAccountsConfig;
  }
  
  return JSON.stringify(config, null, 2);
}

async function getConfigFromFile (props: {
  source: string; 
  filePath: string; 
  repositoryName: string;
  branchName: string;
  s3Bucket?: string;
  newRepo?: boolean;
}) {
  const { source, branchName, filePath, repositoryName, s3Bucket, newRepo } = props;
  let config;
  if (source === 's3') {
    console.log(`Reading file ${filePath} from Bucket ${s3Bucket}`);
    const configString = await s3.getObjectBodyAsString({
      Bucket: s3Bucket!,
      Key: filePath,
    });
    config = JSON.parse(configString);
    if (newRepo) {
      let parentCommitId;
      try {
        const currentCommit = await codecommit.getBranch(repositoryName, branchName);
        parentCommitId = currentCommit.branch?.commitId;
      } catch (e) {
        if (e.code === 'BranchDoesNotExistException') {
          console.log(`First Commit to repo`);
        } else {
          throw new Error(e);
        }
      }
      await codecommit.putFile({
        branchName,
        repositoryName,
        filePath,
        fileContent: JSON.stringify(config, null, 2),
        parentCommitId,
        commitMessage: `Initial configuration file copied from s3://${s3Bucket}/${filePath}`,
      });
      await s3.deleteObject({
        Bucket: s3Bucket!,
        Key: filePath,
      });
    }
  } else {
    const configResponse = await codecommit.getFile(repositoryName, filePath, branchName);
    config = JSON.parse(configResponse.fileContent.toString());
  }
  return config;
}