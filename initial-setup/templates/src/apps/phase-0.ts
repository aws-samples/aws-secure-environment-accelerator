import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as accessanalyzer from '@aws-cdk/aws-accessanalyzer';
import * as iam from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import { createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { JsonOutputValue } from '../common/json-output';
import { SecurityHubStack } from '../common/security-hub';
import * as budget from '../deployments/billing/budget';
import * as centralServices from '../deployments/central-services';
import * as defaults from '../deployments/defaults';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as iamDeployment from '../deployments/iam';
import * as mad from '../deployments/mad';
import { PhaseInput } from './shared';
import { LogResourcePolicy } from '@custom-resources/logs-resource-policy';
import { DNS_LOGGING_LOG_GROUP_REGION } from '../utils/constants';
import { createR53LogGroupName } from '../common/r53-zones';
/**
 * This is the main entry point to deploy phase 0.
 *
 * The following resources are deployed in phase 0:
 *   - Log archive bucket
 *   - Copy of the central bucket
 */
export async function deploy({ acceleratorConfig, accountStacks, accounts, context }: PhaseInput) {
  // Create defaults, e.g. S3 buckets, EBS encryption keys
  const defaultsResult = await defaults.step1({
    acceleratorPrefix: context.acceleratorPrefix,
    acceleratorName: context.acceleratorName,
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  const centralBucket = defaultsResult.centralBucketCopy;

  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  const uploadArtifacts = ({
    artifactName,
    artifactFolderName,
    artifactKeyPrefix,
    accountKey,
    destinationKeyPrefix,
  }: {
    artifactName: string;
    artifactFolderName: string;
    artifactKeyPrefix: string;
    accountKey: string;
    destinationKeyPrefix?: string;
  }): void => {
    const artifactsFolderPath = path.join(__dirname, '..', '..', '..', '..', 'reference-artifacts', artifactFolderName);

    new s3deployment.BucketDeployment(masterAccountStack, `${artifactName}ArtifactsDeployment${accountKey}`, {
      sources: [s3deployment.Source.asset(artifactsFolderPath)],
      destinationBucket: centralBucket,
      destinationKeyPrefix,
    });

    // outputs to store reference artifacts s3 bucket information
    new JsonOutputValue(masterAccountStack, `${artifactName}ArtifactsOutput${accountKey}`, {
      type: `${artifactName}ArtifactsOutput`,
      value: {
        accountKey,
        bucketArn: centralBucket.bucketArn,
        bucketName: centralBucket.bucketName,
        keyPrefix: artifactKeyPrefix,
      },
    });
  };

  // upload IAM-Policies Artifacts
  uploadArtifacts({
    artifactName: 'IamPolicy',
    artifactFolderName: 'iam-policies',
    artifactKeyPrefix: 'iam-policy',
    accountKey: masterAccountKey,
    destinationKeyPrefix: 'iam-policy',
  });

  // upload RDGW Artifacts
  uploadArtifacts({
    artifactName: 'Rdgw',
    artifactFolderName: 'scripts',
    artifactKeyPrefix: 'config/scripts/',
    accountKey: masterAccountKey,
    destinationKeyPrefix: 'config/scripts',
  });

  // Create secrets for the different deployments
  const secretsContainer = new SecretsContainer(masterAccountStack, 'Secrets');

  // Create IAM secrets
  await iamDeployment.createSecrets({
    acceleratorPrefix: context.acceleratorPrefix,
    accounts,
    config: acceleratorConfig,
    secretsContainer,
  });

  // Create MAD secrets
  await mad.createSecrets({
    acceleratorPrefix: context.acceleratorPrefix,
    accounts,
    config: acceleratorConfig,
    secretsContainer,
  });

  const securityAccountKey = acceleratorConfig.getMandatoryAccountKey('central-security');
  const securityStack = accountStacks.tryGetOrCreateAccountStack(securityAccountKey);
  if (!securityStack) {
    console.warn(`Cannot find security stack`);
  } else {
    new accessanalyzer.CfnAnalyzer(securityStack, 'OrgAccessAnalyzer', {
      analyzerName: createName({
        name: 'AccessAnalyzer',
        account: false,
        region: false,
      }),
      type: 'ORGANIZATION',
    });
  }

  const securityMasterAccountStack = accountStacks.tryGetOrCreateAccountStack(securityAccountKey);
  if (!securityMasterAccountStack) {
    console.warn(`Cannot find security stack`);
  } else {
    const globalOptions = acceleratorConfig['global-options'];
    const securityMasterAccount = accounts.find(a => a.key === securityAccountKey);
    const subAccountIds = accounts.map(account => ({
      AccountId: account.id,
      Email: account.email,
    }));

    // Create Security Hub stack for Master Account in Security Account
    new SecurityHubStack(securityMasterAccountStack, `SecurityHubMasterAccountSetup`, {
      account: securityMasterAccount!,
      standards: globalOptions['security-hub-frameworks'],
      subAccountIds,
    });
  }

  // MAD creation step 1
  // Needs EBS default keys from the EBS default step
  await mad.step1({
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    accountEbsEncryptionKeys: defaultsResult.accountEbsEncryptionKeys,
    accountStacks,
    config: acceleratorConfig,
  });

  // Firewall creation step 1
  await firewallCluster.step1({
    accountStacks,
    config: acceleratorConfig,
  });

  // Budget creation step 1
  await budget.step1({
    accountStacks,
    config: acceleratorConfig,
  });

  // Central Services step 1
  await centralServices.step1({
    accountStacks,
    config: acceleratorConfig,
    accounts,
  });

  /**
   * Code to create LogGroups required for DNS Logging
   */
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const zonesStack = accountStacks.getOrCreateAccountStack(zonesAccountKey, DNS_LOGGING_LOG_GROUP_REGION);
  const logGroups = zonesConfig.names.public.map(phz => {
    const logGroupName = createR53LogGroupName({
      acceleratorPrefix: context.acceleratorPrefix,
      domain: phz,
    });
    return new logs.LogGroup(zonesStack, `Route53HostedZone-LogGroup`, {
      logGroupName,
    });
  });

  if (logGroups.length > 0) {
    const wildcardLogGroupName = createR53LogGroupName({
      acceleratorPrefix: context.acceleratorPrefix,
      domain: '*',
    });

    // Allow r53 services to write to the log group
    const logGroupPolicy = new LogResourcePolicy(zonesStack, 'R53LogGroupPolicy', {
      policyName: createName({
        name: 'query-logging-pol',
      }),
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          principals: [new iam.ServicePrincipal('route53.amazonaws.com')],
          resources: [`arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${wildcardLogGroupName}`],
        }),
      ],
    });
    for (const logGroup of logGroups) {
      logGroupPolicy.node.addDependency(logGroup);
    }
  }

  // TODO Deprecate these outputs
  const logArchiveAccountKey = acceleratorConfig['global-options']['central-log-services'].account;
  const logArchiveStack = accountStacks.getOrCreateAccountStack(logArchiveAccountKey);
  const logArchiveBucket = defaultsResult.centralLogBucket;
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_ACCOUNT_ID, {
    value: logArchiveStack.accountId,
  });
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN, {
    value: logArchiveBucket.bucketArn,
  });
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_NAME, {
    value: logArchiveBucket.bucketName,
  });
  new cdk.CfnOutput(logArchiveStack, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN, {
    value: logArchiveBucket.encryptionKey!.keyArn,
  });
}
