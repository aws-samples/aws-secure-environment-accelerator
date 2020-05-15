import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { S3Control } from '@aws-pbmm/common-lambda/lib/aws/s3-control';
import { PutPublicAccessBlockRequest } from 'aws-sdk/clients/s3control';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { Account } from './load-accounts-step';
import { EC2 } from '@aws-pbmm/common-lambda/lib/aws/ec2';
import { StackOutput, getStackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { CloudTrail } from '@aws-pbmm/common-lambda/lib/aws/cloud-trail';
import { PutEventSelectorsRequest, UpdateTrailRequest } from 'aws-sdk/clients/cloudtrail';
import { CUR } from '@aws-pbmm/common-lambda/lib/aws/cur';
import { PutReportDefinitionRequest } from 'aws-sdk/clients/cur';

interface AccountDefaultSettingsInput {
  assumeRoleName: string;
  accounts: Account[];
  configSecretSourceId: string;
  stackOutputSecretId: string;
}

export const handler = async (input: AccountDefaultSettingsInput) => {
  console.log('Setting account level defaults for all accounts in an organization ...');
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, accounts, configSecretSourceId, stackOutputSecretId } = input;

  const secrets = new SecretsManager();
  const configString = await secrets.getSecret(configSecretSourceId);
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  const acceleratorConfig = AcceleratorConfig.fromString(configString.SecretString!);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

  // TODO Cache the account credentials in the STS class to improve reusability
  const accountCredentials: { [accountId: string]: aws.Credentials } = {};
  const getAccountCredentials = async (accountId: string): Promise<aws.Credentials> => {
    if (accountCredentials[accountId]) {
      return accountCredentials[accountId];
    }
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    accountCredentials[accountId] = credentials;
    return credentials;
  };

  const putPublicAccessBlock = async (
    accountId: string,
    accountKey: string,
    blockPublicAccess: boolean,
  ): Promise<void> => {
    const credentials = await getAccountCredentials(accountId);
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
    const credentials = await getAccountCredentials(accountId);

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
    const credentials = await getAccountCredentials(accountId);

    const cloudTrailName = outputKeys.AWS_LANDING_ZONE_CLOUD_TRAIL_NAME;
    console.log('AWS LZ CloudTrail Name: ' + cloudTrailName);

    const logArchiveAccount = accounts.find(a => a.type === 'log-archive');
    if (!logArchiveAccount) {
      throw new Error('Cannot find account with type log-archive');
    }
    const logArchiveAccountKey = logArchiveAccount.key;
    const s3KmsKeyArn = getStackOutput(outputs, logArchiveAccountKey, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN);
    console.log('AWS LZ CloudTrail S3 Bucket KMS Key ARN: ' + s3KmsKeyArn);

    const cloudtrail = new CloudTrail(credentials);

    const putInsightSelectorsResponse = await cloudtrail.putInsightSelectors(cloudTrailName);
    console.log('putInsightSelectorsResponse: ', putInsightSelectorsResponse);
    console.log(`Cloud Trail - Insights enabled for AWS LZ CloudTrail in account - ${accountKey}`);

    const trailNameList: string[] = [];
    trailNameList.push(cloudTrailName);
    const describeTrailsResponse = await cloudtrail.describeTrails(false, trailNameList);
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
              Values: [`arn:aws:s3:::${cloudTrailDetails?.S3BucketName}/`],
            },
          ],
          ExcludeManagementEventSources: [],
          IncludeManagementEvents: true,
          ReadWriteType: 'All',
        },
      ],
      TrailName: outputKeys.AWS_LANDING_ZONE_CLOUD_TRAIL_NAME,
    };
    const putEventSelectorsResponse = await cloudtrail.putEventSelectors(putEventSelectorsRequest);
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
    const updateTrailResponse = await cloudtrail.updateTrail(updateTrailRequest);
    console.log(`Cloud Trail - settings updated (encryption...) for AWS LZ CloudTrail in account - ${accountKey}`);
  };

  const alterCloudTrailS3BucketEncryptionKey = async (accountId: string, accountKey: string): Promise<void> => {
    const credentials = await getAccountCredentials(accountId);

    let bucket = getStackOutput(outputs, accountKey, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN);
    bucket = bucket.replace('arn:aws:s3:::', '');
    bucket.trimLeft;
    console.log('bucket: ' + bucket);

    const kmsKeyId = getStackOutput(outputs, accountKey, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ID);
    console.log('kmsKeyId: ' + kmsKeyId);

    const s3 = new S3(credentials);
    await s3.putBucketKmsEncryption(bucket, kmsKeyId);
    console.log(`Cloud Trail - S3 bucket - default encryption key set as KMS CMK for account - ${accountKey}`);
  };

  const enableCostAndUsageReport = async (accountId: string, accountKey: string): Promise<void> => {
    const credentials = await getAccountCredentials(accountId);

    const globalOptionsConfig = acceleratorConfig['global-options'];
    const costAndUsageReportConfig = globalOptionsConfig.reports['cost-and-usage-report'];

    const cur = new CUR(credentials);

    const params: PutReportDefinitionRequest = {
      ReportDefinition: {
        AdditionalSchemaElements: costAndUsageReportConfig['additional-schema-elements'],
        Compression: costAndUsageReportConfig.compression,
        Format: costAndUsageReportConfig.format,
        ReportName: costAndUsageReportConfig['report-name'],
        S3Bucket: costAndUsageReportConfig['s3-bucket']
          .replace('xxaccountIdxx', accountId)
          .replace('xxregionxx', costAndUsageReportConfig['s3-region']),
        S3Prefix: costAndUsageReportConfig['s3-prefix'].replace('xxaccountIdxx', accountId),
        S3Region: costAndUsageReportConfig['s3-region'],
        TimeUnit: costAndUsageReportConfig['time-unit'],
        AdditionalArtifacts: costAndUsageReportConfig['additional-artifacts'],
        RefreshClosedReports: costAndUsageReportConfig['refresh-closed-reports'],
        ReportVersioning: costAndUsageReportConfig['report-versioning'],
      },
    };
    // TODO Overwrite report if exists
    const PutReportDefinitionResponse = await cur.putReportDefinition(params);
    console.log('PutReportDefinitionResponse: ', PutReportDefinitionResponse);
    console.log(`Cost and Usage Report - enabled for account - ${accountKey}`);
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

    // enable default encryption for EBS
    await enableEbsDefaultEncryption(account.id, account.key);

    try {
      // update AWS LZ cloud trail settings
      await updateCloudTrailSettings(account.id, account.key);
    } catch (e) {
      console.error(`Error while updating CloudTrail settings`);
      console.error(e);
    }

    if (account.type === 'log-archive') {
      // alter the encryption key used cloud trail s3 bucket
      await alterCloudTrailS3BucketEncryptionKey(account.id, account.key);
      console.log(`Cloud Trail - S3 bucket - default encryption key set as KMS CMK for account - ${accountKey}`);
    }

    try {
      if (account.type === 'primary') {
        await enableCostAndUsageReport(account.id, account.key);
      }
    } catch (e) {
      // TODO Overwrite report
      if (e.code === 'DuplicateReportNameException') {
        console.warn(`Report already exists`);
      } else {
        throw e;
      }
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Successfully defaults set at account level for all accounts in an organization.',
  };
};
