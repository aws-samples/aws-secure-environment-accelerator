import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { EC2 } from '@aws-pbmm/common-lambda/lib/aws/ec2';
import { StackOutput, getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { CloudTrail } from '@aws-pbmm/common-lambda/lib/aws/cloud-trail';
import { PutEventSelectorsRequest, UpdateTrailRequest } from 'aws-sdk/clients/cloudtrail';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { UpdateDocumentRequest, CreateDocumentRequest } from 'aws-sdk/clients/ssm';

interface AccountDefaultSettingsInput extends LoadConfigurationInput {
  assumeRoleName: string;
  accounts: Account[];
  stackOutputSecretId: string;
}

export const handler = async (input: AccountDefaultSettingsInput) => {
  console.log('Setting account level defaults for all accounts in an organization ...');
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, accounts, configRepositoryName, stackOutputSecretId, configFilePath, configCommitId } = input;

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const logAccountKey = acceleratorConfig.getMandatoryAccountKey('central-log');

  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

  const enableEbsDefaultEncryption = async (accountId: string, accountKey: string): Promise<void> => {
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);

    const kmsKeyId = getStackOutput(outputs, accountKey, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION);
    if (!kmsKeyId) {
      console.warn(
        `Cannot find output of ${outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION} for account ${accountKey}`,
      );
      return;
    }
    console.log('kmsKeyId: ' + kmsKeyId);

    const ec2 = new EC2(credentials);
    const enableEbsEncryptionByDefaultResult = await ec2.enableEbsEncryptionByDefault(false);
    console.log('enableEbsEncryptionByDefaultResult: ', enableEbsEncryptionByDefaultResult);

    const modifyEbsDefaultKmsKeyIdResult = await ec2.modifyEbsDefaultKmsKeyId(kmsKeyId, false);
    console.log('modifyEbsDefaultKmsKeyIdResult: ', modifyEbsDefaultKmsKeyIdResult);
    console.log(`EBS default encryption turned ON with KMS CMK for account - ${accountKey}`);
  };

  const updateCloudTrailSettings = async (accountId: string, accountKey: string): Promise<void> => {
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);

    const cloudTrailName = outputKeys.AWS_LANDING_ZONE_CLOUD_TRAIL_NAME;
    console.log('AWS LZ CloudTrail Name: ' + cloudTrailName);

    const logArchiveAccount = accounts.find(a => a.key === logAccountKey);
    if (!logArchiveAccount) {
      console.warn('Cannot find account with type log-archive');
      return;
    }
    const s3KmsKeyArn = getStackOutput(outputs, logAccountKey, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN);
    console.log('AWS LZ CloudTrail S3 Bucket KMS Key ARN: ' + s3KmsKeyArn);

    const cloudTrail = new CloudTrail(credentials);

    const putInsightSelectorsResponse = await cloudTrail.putInsightSelectors(cloudTrailName);
    console.log('putInsightSelectorsResponse: ', putInsightSelectorsResponse);
    console.log(`Cloud Trail - Insights enabled for AWS LZ CloudTrail in account - ${accountKey}`);

    const trailNameList: string[] = [];
    trailNameList.push(cloudTrailName);
    const describeTrailsResponse = await cloudTrail.describeTrails(false, trailNameList);
    console.log('describeTrailsResponse: ', describeTrailsResponse);

    if (!describeTrailsResponse.trailList) {
      console.warn(`CloudTrail not found with name "${cloudTrailName}"`);
      return;
    }
    let cloudTrailDetails;
    for (const trailList of describeTrailsResponse.trailList) {
      cloudTrailDetails = trailList;
    }

    const putEventSelectorsRequest: PutEventSelectorsRequest = {
      EventSelectors: [
        {
          DataResources: [
            {
              Type: 'AWS::S3::Object',
              Values: ['arn:aws:s3:::'],
            },
          ],
          ExcludeManagementEventSources: [],
          IncludeManagementEvents: true,
          ReadWriteType: 'All',
        },
      ],
      TrailName: outputKeys.AWS_LANDING_ZONE_CLOUD_TRAIL_NAME,
    };
    const putEventSelectorsResponse = await cloudTrail.putEventSelectors(putEventSelectorsRequest);
    console.log('putEventSelectorsResponse: ', putEventSelectorsResponse);
    console.log(`Cloud Trail - S3 Object Level Logging enabled for AWS LZ CloudTrail in account - ${accountKey}`);

    const updateTrailRequest: UpdateTrailRequest = {
      Name: cloudTrailName,
      CloudWatchLogsLogGroupArn: cloudTrailDetails?.CloudWatchLogsLogGroupArn,
      CloudWatchLogsRoleArn: cloudTrailDetails?.CloudWatchLogsRoleArn,
      EnableLogFileValidation: cloudTrailDetails?.LogFileValidationEnabled,
      IncludeGlobalServiceEvents: cloudTrailDetails?.IncludeGlobalServiceEvents,
      IsMultiRegionTrail: cloudTrailDetails?.IsMultiRegionTrail,
      IsOrganizationTrail: cloudTrailDetails?.IsOrganizationTrail,
      KmsKeyId: s3KmsKeyArn,
      S3BucketName: cloudTrailDetails?.S3BucketName,
      S3KeyPrefix: cloudTrailDetails?.S3KeyPrefix,
      SnsTopicName: cloudTrailDetails?.SnsTopicName,
    };
    const updateTrailResponse = await cloudTrail.updateTrail(updateTrailRequest);
    console.log(`Cloud Trail - settings updated (encryption...) for AWS LZ CloudTrail in account - ${accountKey}`);
  };

  const updateSSMdocument = async (accountId: string, accountKey: string): Promise<void> => {
    const globalOptionsConfig = acceleratorConfig['global-options'];
    const useS3 = globalOptionsConfig['central-log-services']['ssm-to-s3'];
    const useCWL = globalOptionsConfig['central-log-services']['ssm-to-cwl'];

    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const ssm = new aws.SSM({
      credentials,
    });
    const kms = new aws.KMS({
      credentials,
    });
    const cloudwatchlogs = new aws.CloudWatchLogs({
      credentials,
    });

    const logArchiveAccount = accounts.find(a => a.key === logAccountKey);
    if (!logArchiveAccount) {
      console.warn('Cannot find account with type log-archive');
      return;
    }
    const logArchiveAccountKey = logArchiveAccount.key;
    const bucketName = getStackOutput(outputs, logArchiveAccountKey, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_NAME);
    if (!bucketName) {
      console.warn(`Cannot find output ${outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_NAME}`);
      return;
    }
    const ssmKeyId = getStackOutput(outputs, accountKey, outputKeys.OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER);
    if (!ssmKeyId) {
      console.warn(`Cannot find output ${outputKeys.OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER}`);
      return;
    }
    const logGroupName = getStackOutput(
      outputs,
      accountKey,
      outputKeys.OUTPUT_CLOUDWATCH_LOG_GROUP_FOR_SSM_SESSION_MANAGER,
    );
    if (!logGroupName) {
      console.warn(`Cannot find output ${outputKeys.OUTPUT_CLOUDWATCH_LOG_GROUP_FOR_SSM_SESSION_MANAGER}`);
      return;
    }

    // Encrypt CWL doc: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
    const kmsParams = {
      KeyId: ssmKeyId,
    };
    const ssmKey = await kms.describeKey(kmsParams).promise();
    console.log('SSM key: ', ssmKey);

    const cwlParams = {
      kmsKeyId: ssmKey.KeyMetadata?.Arn || ssmKeyId,
      logGroupName,
    };
    console.log('CWL encrypt: ', cwlParams);
    await cloudwatchlogs.associateKmsKey(cwlParams).promise();

    // Based on doc: https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-configure-preferences-cli.html
    const settings = {
      schemaVersion: '1.0',
      description: 'Document to hold regional settings for Session Manager',
      sessionType: 'Standard_Stream',
      inputs: {
        s3BucketName: bucketName,
        s3KeyPrefix: `/${accountId}/SSM/`, // TODO: add region when region is available to pass in
        s3EncryptionEnabled: useS3,
        cloudWatchLogGroupName: logGroupName,
        cloudWatchEncryptionEnabled: useCWL,
        kmsKeyId: ssmKeyId,
        runAsEnabled: false,
        runAsDefaultUser: '',
      },
    };

    try {
      const ssmDocument = await ssm
        .describeDocument({
          Name: 'SSM-SessionManagerRunShell',
        })
        .promise();

      const updateDocumentRequest: UpdateDocumentRequest = {
        Content: JSON.stringify(settings),
        Name: 'SSM-SessionManagerRunShell',
        DocumentVersion: '$LATEST',
      };
      console.log('Update SSM Request: ', updateDocumentRequest);
      const updateSSMResponse = await ssm.updateDocument(updateDocumentRequest).promise();
      console.log('Update SSM: ', updateSSMResponse);
    } catch (e) {
      // if Document not exist, call createDocument API
      if (e.code === 'InvalidDocument') {
        const createDocumentRequest: CreateDocumentRequest = {
          Content: JSON.stringify(settings),
          Name: 'SSM-SessionManagerRunShell',
        };
        console.log('Create SSM Request: ', createDocumentRequest);
        const createSSMResponse = await ssm.createDocument(createDocumentRequest).promise();
        console.log('Create SSM: ', createSSMResponse);
      }
    }
  };

  const accountConfigs = acceleratorConfig.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const account = accounts.find(a => a.key === accountKey);
    if (!account) {
      console.warn(`Cannot find account with key "${accountKey}"`);
      continue;
    }

    try {
      // enable default encryption for EBS
      await enableEbsDefaultEncryption(account.id, account.key);
    } catch (e) {
      console.error(`Ignoring error while enabling EBS default encryption`);
      console.error(e);
    }

    try {
      // update AWS LZ cloud trail settings
      await updateCloudTrailSettings(account.id, account.key);
    } catch (e) {
      console.error(`Error while updating CloudTrail settings`);
      console.error(e);
    }

    try {
      await updateSSMdocument(account.id, account.key);
    } catch (e) {
      console.error(e);
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Successfully defaults set at account level for all accounts in an organization.',
  };
};
