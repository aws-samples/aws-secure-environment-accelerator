/* eslint-disable  @typescript-eslint/no-explicit-any */

import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { StepFunctions } from '@aws-accelerator/common/src/aws/stepfunctions';
import { STS } from '@aws-accelerator/common/src/aws/sts';

export const handler = async (_event: any, _context: any) => {
  console.log(_event);

  const accleratorPrefix = process.env.ACCELERATOR_PREFIX!;
  const centralBucketName = process.env.CENTRAL_BUCKET_NAME!;
  const bucketName = process.env.BUCKET_NAME!;
  const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME!;
  const outputsTableName = `${accleratorPrefix}Outputs`;
  const acceleratorVersionSSMPath = '/accelerator/version';
  const acceleratorFirstVersionSSMPath = '/accelerator/first-version';
  const lastSuccessfulCommitIdSecretPath = 'accelerator/config/last-successful-commit';
  const codecommit = new CodeCommit();
  const ddb = new DynamoDB();
  const organizations = new Organizations();
  const secrets = new SecretsManager();
  const ssm = new SSM();
  const s3 = new S3();
  const stepFunctions = new StepFunctions();
  const sts = new STS();
  const stateMachineName = `${accleratorPrefix}MainStateMachine_sm`;

  const callerIdentity = await sts.getCallerIdentity();
  const stateMachineArn = `arn:aws:states:${process.env.AWS_REGION}:${callerIdentity.Account}:stateMachine:${stateMachineName}`;

  console.log('Getting accelerator versions');
  const acceleratorCurrentVersionParameter = await ssm.getParameter(acceleratorVersionSSMPath);
  const acceleratorCurrentVersionValue = JSON.parse(acceleratorCurrentVersionParameter.Parameter?.Value || '{}');
  const acceleratorCurrentVersion = acceleratorCurrentVersionValue.Branch;
  const acceleratorFirstVersion = await ssm.getParameter(acceleratorFirstVersionSSMPath);

  console.log(acceleratorCurrentVersionValue);

  //Get latest successful config
  const lastSuccessfulCommitIdSecret = await secrets.getSecret(lastSuccessfulCommitIdSecretPath);
  const lastSuccessfulCommitIdObj = JSON.parse(lastSuccessfulCommitIdSecret.SecretString!);
  const lastSuccessfulCommitId = lastSuccessfulCommitIdObj.configCommitId;
  const rawASEAConfigFile = await codecommit.getFile(configRepositoryName, 'raw/config.json', lastSuccessfulCommitId);
  const aseaConfig = rawASEAConfigFile.fileContent.toString();
  const aseaConfigObj = JSON.parse(aseaConfig);

  //Retrieve Log Bucket and AES Log bucket info
  const logArchiveAccountName = aseaConfigObj['global-options']['central-log-services']['account'];
  const logArchiveRegion = aseaConfigObj['global-options']['central-log-services']['region'];
  const ddbOutputId = `${logArchiveAccountName}-${logArchiveRegion}-0`;
  const outputsItem = await ddb.documentClient.get({ TableName: outputsTableName, Key: { id: ddbOutputId } }).promise();
  const outputs: any[] = JSON.parse(outputsItem?.Item?.outputValue);

  const aesLogBucketOutput = outputs.find((output: any) => {
    return output.outputKey.includes('AesLogBucketOutput');
  });
  const aesLogBucketInfo = JSON.parse(aesLogBucketOutput.outputValue);

  const logBucketOutput = outputs.find((output: any) => {
    return output.outputKey.includes('LogBucketOutput');
  });
  const logBucketInfo = JSON.parse(logBucketOutput.outputValue);

  // Get step function info
  const executions = await stepFunctions.listExecutions({ stateMachineArn, statusFilter: 'SUCCEEDED' });
  const latestSuccessfulExecution = executions.reduce((latest: any, execution: any) => {
    if (!latest) {
      return execution;
    }
    const latestStartDate = new Date(latest.startDate);
    const currentStartDate = new Date(execution.startDate);
    if (latestStartDate >= currentStartDate) {
      return latest;
    }
    return execution;
  }, {});

  // Retrieve Organization Information
  const organizationInfo = await organizations.describeOrganization();
  const organizationId = organizationInfo?.Id;
  const accounts = await organizations.listAccounts();
  const ous = await organizations.listOrganizationalUnits();

  const ousWithPath: any = [];
  for (const ou of ous) {
    const path = await organizations.getOrganizationalUnitWithPath(ou.Id!);
    ousWithPath.push({
      ...ou,
      Path: path.Path,
    });
  }

  //Retrieve Account Information
  const accountsWithOuPath: any = [];
  for (const account of accounts) {
    const accountOuParent = await organizations.listParents(account.Id!);
    const ou = ousWithPath.find((ou: any) => {
      return accountOuParent[0].Id === ou.Id;
    });
    accountsWithOuPath.push({
      ...account,
      Path: ou.Path,
    });
  }

  const metadata = {
    acceleratorFirstVersion: acceleratorFirstVersion.Parameter?.Value,
    acceleratorCurrentVersion,
    lastSuccessfulCommitId,
    latestSuccessfulExecution,
    logBucket: logBucketInfo,
    aesLogBucket: aesLogBucketInfo,
    organizationId,
    accounts: accountsWithOuPath,
    ous: ousWithPath,
  };

  const centralBucketItems = await s3.listBucket(centralBucketName);
  const metadataBucketItems = await s3.listBucket(bucketName);
  const centralBucketItemNames = centralBucketItems.map(item => item.Key);

  const itemsToDelete = metadataBucketItems.filter(item => {
    const splitKey = item.Key?.split('/') || [];
    splitKey.shift();
    const key = splitKey.join('/');
    return !centralBucketItemNames.includes(key);
  });

  const keysToDelete = itemsToDelete.map(item => {
    return { Key: item.Key! };
  });

  if (keysToDelete.length > 0) {
    await s3.deleteObjects({ Bucket: bucketName, Delete: { Objects: keysToDelete } });
  }
  //Delete Utens
  for (const item of centralBucketItems) {
    if (!item.Key?.startsWith('certs/')) {
      await s3.copyObjectWithACL(centralBucketName, item.Key!, bucketName, 'config', 'bucket-owner-full-control');
    }
  }

  console.log('writing metadata and config to bucket.');

  await s3.putObject({
    Bucket: bucketName,
    Key: 'metadata.json',
    Body: JSON.stringify(metadata, null, 4),
    ACL: 'bucket-owner-full-control',
  });
  await s3.putObject({
    Bucket: bucketName,
    Key: 'config/config.json',
    Body: aseaConfig,
    ACL: 'bucket-owner-full-control',
  });
};
