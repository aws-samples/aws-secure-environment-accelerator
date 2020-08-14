import * as cdk from '@aws-cdk/core';
import * as accessanalyzer from '@aws-cdk/aws-accessanalyzer';
import * as iam from '@aws-cdk/aws-iam';
import { LogGroup } from '@custom-resources/logs-log-group';
import { LogResourcePolicy } from '@custom-resources/logs-resource-policy';
import { createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import * as artifactsDeployment from '../deployments/artifacts';
import * as budget from '../deployments/billing/budget';
import * as centralServices from '../deployments/central-services';
import * as defaults from '../deployments/defaults';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as iamDeployment from '../deployments/iam';
import * as madDeployment from '../deployments/mad';
import * as secretsDeployment from '../deployments/secrets';
import * as guardDutyDeployment from '../deployments/guardduty';
import { PhaseInput } from './shared';
import { DNS_LOGGING_LOG_GROUP_REGION } from '@aws-pbmm/common-lambda/lib/util/constants';
import { createR53LogGroupName } from '../common/r53-zones';
import * as accountWarming from '../deployments/account-warming';
import * as passwordPolicy from '../deployments/iam-password-policy';
import * as transitGateway from '../deployments/transit-gateway';
import { getAccountId } from '../utils/accounts';
import * as rsyslogDeployment from '../deployments/rsyslog';
import { IamRoleOutputFinder } from '@aws-pbmm/common-outputs/lib/iam-role';

/**
 * This is the main entry point to deploy phase 0.
 *
 * The following resources are deployed in phase 0:
 *   - Log archive bucket
 *   - Copy of the central bucket
 */
export async function deploy({ acceleratorConfig, accountStacks, accounts, context, outputs }: PhaseInput) {
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  if (!masterAccountId) {
    throw new Error(`Cannot find mandatory primary account ${masterAccountKey}`);
  }
  // verify and create ec2 instance to increase account limits
  await accountWarming.step1({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  if (!acceleratorConfig['global-options']['alz-baseline']) {
    await passwordPolicy.step1({
      accountStacks,
      config: acceleratorConfig,
    });
  }

  // Create defaults, e.g. S3 buckets, EBS encryption keys
  const defaultsResult = await defaults.step1({
    acceleratorPrefix: context.acceleratorPrefix,
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  const centralBucket = defaultsResult.centralBucketCopy;
  await artifactsDeployment.step1({
    accountStacks,
    centralBucket,
    config: acceleratorConfig,
  });

  // Create secrets container for the different deployments
  const { secretsContainer } = await secretsDeployment.step1({
    accountStacks,
    config: acceleratorConfig,
  });

  // Create IAM secrets
  await iamDeployment.createSecrets({
    acceleratorPrefix: context.acceleratorPrefix,
    accounts,
    config: acceleratorConfig,
    secretsContainer,
  });

  if (!acceleratorConfig['global-options']['alz-baseline']) {
    // Create IAM role for Config Service
    await iamDeployment.createConfigServiceRoles({
      acceleratorPrefix: context.acceleratorPrefix,
      config: acceleratorConfig,
      accountStacks,
    });
  }

  // Create MAD secrets
  await madDeployment.createSecrets({
    acceleratorExecutionRoleName: context.acceleratorExecutionRoleName,
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

  // Update Central bucket in log-archive to add as publisher to GuardDuty
  const logBucket = defaultsResult.centralLogBucket;
  await guardDutyDeployment.enableGuardDutyPolicy({
    accountStacks,
    config: acceleratorConfig,
    accounts,
    logBucket,
    outputs,
  });

  // MAD creation step 1
  // Needs EBS default keys from the EBS default step
  await madDeployment.step1({
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    accountEbsEncryptionKeys: defaultsResult.accountEbsEncryptionKeys,
    accountStacks,
    config: acceleratorConfig,
  });

  await rsyslogDeployment.step1({
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

  // Transit Gateway step 1
  await transitGateway.step1({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  /**
   * Code to create LogGroups required for DNS Logging
   */
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const zonesStack = accountStacks.getOrCreateAccountStack(zonesAccountKey, DNS_LOGGING_LOG_GROUP_REGION);
  const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: zonesAccountKey,
    roleKey: 'LogGroupRole',
  });
  if (logGroupLambdaRoleOutput) {
    const logGroups = zonesConfig.names.public.map(phz => {
      const logGroupName = createR53LogGroupName({
        acceleratorPrefix: context.acceleratorPrefix,
        domain: phz,
      });
      return new LogGroup(zonesStack, `Route53HostedZoneLogGroup`, {
        logGroupName,
        roleArn: logGroupLambdaRoleOutput.roleArn,
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
