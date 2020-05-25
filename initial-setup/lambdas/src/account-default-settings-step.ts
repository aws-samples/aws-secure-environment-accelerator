import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { S3Control } from '@aws-pbmm/common-lambda/lib/aws/s3-control';
import { PutPublicAccessBlockRequest } from 'aws-sdk/clients/s3control';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { EC2 } from '@aws-pbmm/common-lambda/lib/aws/ec2';
import { StackOutput, getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { CloudTrail } from '@aws-pbmm/common-lambda/lib/aws/cloud-trail';
import { PutEventSelectorsRequest, UpdateTrailRequest } from 'aws-sdk/clients/cloudtrail';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { UpdateDocumentRequest } from 'aws-sdk/clients/ssm';

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

  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

  const putPublicAccessBlock = async (
    accountId: string,
    accountKey: string,
    blockPublicAccess: boolean,
  ): Promise<void> => {
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const s3control = new S3Control(credentials);
    const putPublicAccessBlockRequest: PutPublicAccessBlockRequest = {
      AccountId: accountId,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: blockPublicAccess,
        BlockPublicPolicy: blockPublicAccess,
        IgnorePublicAcls: blockPublicAccess,
        RestrictPublicBuckets: blockPublicAccess,
      },
    };
    await s3control.putPublicAccessBlock(putPublicAccessBlockRequest);
    console.log(`Block S3 public access turned ON for account - ${accountKey}`);
  };

  const enableEbsDefaultEncryption = async (accountId: string, accountKey: string): Promise<void> => {
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);

    const kmsKeyId = getStackOutput(outputs, accountKey, outputKeys.OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION);
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

    const logArchiveAccount = accounts.find(a => a.type === 'log-archive');
    if (!logArchiveAccount) {
      throw new Error('Cannot find account with type log-archive');
    }
    const logArchiveAccountKey = logArchiveAccount.key;
    const s3KmsKeyArn = getStackOutput(outputs, logArchiveAccountKey, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN);
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
      throw new Error(`CloudTrail not found with name "${cloudTrailName}"`);
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

    const logArchiveAccount = accounts.find(a => a.type === 'log-archive');
    if (!logArchiveAccount) {
      throw new Error('Cannot find account with type log-archive');
    }
    const logArchiveAccountKey = logArchiveAccount.key;
    const bucketName = getStackOutput(outputs, logArchiveAccountKey, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_NAME);
    const ssmKeyId = getStackOutput(outputs, accountKey, outputKeys.OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER);

    // Encrypt CWL doc: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
    const kmsParams = {
      KeyId: ssmKeyId,
    };
    const ssmKey = await kms.describeKey(kmsParams).promise();
    console.log('SSM key: ', ssmKey);

    const cwlParams = {
      kmsKeyId: ssmKey.KeyMetadata?.Arn || ssmKeyId,
      logGroupName: '/PBMMAccel/SSM',
    };
    const cwlResponse = await cloudwatchlogs.associateKmsKey(cwlParams).promise();
    console.log('CWL encrypt: ', cwlResponse);

    // Based on doc: https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-configure-preferences-cli.html
    const settings = {
      schemaVersion: '1.0',
      description: 'Document to hold regional settings for Session Manager',
      sessionType: 'Standard_Stream',
      inputs: {
        s3BucketName: bucketName,
        s3KeyPrefix: '',
        s3EncryptionEnabled: useS3,
        cloudWatchLogGroupName: '/PBMMAccel/SSM',
        cloudWatchEncryptionEnabled: useCWL,
        kmsKeyId: ssmKeyId,
        runAsEnabled: false,
        runAsDefaultUser: '',
      },
    };

    const updateDocumentRequest: UpdateDocumentRequest = {
      Content: JSON.stringify(settings),
      Name: 'SSM-SessionManagerRunShell',
    };
    console.log('Update SSM Request: ', updateDocumentRequest);
    const updateSSMResponse = await ssm.updateDocument(updateDocumentRequest).promise();
    console.log('Update SSM: ', updateSSMResponse);
  };

  const accountConfigs = acceleratorConfig.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const account = accounts.find(a => a.key === accountKey);
    if (!account) {
      throw new Error(`Cannot find account with key "${accountKey}"`);
    }

    // if flag is undefined or false, turn ON s3 block public access
    const blockPublicAccess = !accountConfig['enable-s3-public-access'];
    await putPublicAccessBlock(account.id, account.key, blockPublicAccess);

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
