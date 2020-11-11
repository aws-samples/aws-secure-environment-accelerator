import { STS } from '@aws-accelerator/common/src/aws/sts';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import * as yaml from 'js-yaml';
import { Document } from '@aws-accelerator/cdk-constructs/src/ssm';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as awsConfig from '@aws-cdk/aws-config';
import { Account, getAccountId } from '../../utils/accounts';
import { SSMDocumentShare } from '@aws-accelerator/custom-resource-ssm-document-share';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface CreateRuleProps {
  acceleratorExecutionRoleName: string;
  centralBucketName: string;
  centralAccountId: string;
  config: c.AcceleratorConfig;
  accountStacks: AccountStacks;
  accounts: Account[];
  outputs: StackOutput[];
}

export async function createRule(props: CreateRuleProps) {
  const {
    acceleratorExecutionRoleName,
    config,
    centralAccountId,
    centralBucketName,
    accountStacks,
    accounts,
    outputs,
  } = props;
  const awsConfigConf = config['global-options']['aws-config'];
  if (!awsConfigConf) {
    return;
  }
  const configRules = awsConfigConf['managed-rules'].rules;
  const configRuleDefaults = awsConfigConf['managed-rules'].defaults;

  for(const [ouKey, ouConfig] of config.getOrganizationalUnits()) {
    if (!ouConfig['aws-config']) {
      continue;
    }
    const ouAwsConfigRuleConfigs = ouConfig['aws-config'];
    for (const [accountKey, accountConfig] of config.getAccountConfigsForOu(ouKey)) {
      for (const awsConfigRuleConfig of ouAwsConfigRuleConfigs) {
        for (const ruleName of awsConfigRuleConfig.rules) {
          console.log(`Deploying ${ruleName} in Account ${accountKey} and in regions excluding ${awsConfigRuleConfig['excl-regions']}`);
          const awsConfigRule = configRules.find(cr => cr.name === ruleName);
          if (!awsConfigRule) {
            console.warn(`Config Rule ${ruleName} is not found in Accelerator Configuration global-options`);
            continue;
          }
          const remediation = awsConfigRule.remediation === undefined? configRuleDefaults.remediation: awsConfigRule.remediation;
          const remediationAttempts = awsConfigRule['remediation-attempts'] || configRuleDefaults['remediation-attempts'];
          const remediationRetrySeconds = awsConfigRule['remediation-retry-seconds'] || configRuleDefaults['remediation-retry-seconds'];
          const remediationConcurrency = awsConfigRule['remediation-concurrency'] || configRuleDefaults['remediation-concurrency'];
          console.log(remediation, remediationAttempts, remediationConcurrency, remediationRetrySeconds, awsConfigRule.name);
          for (const region of config['global-options']['supported-regions']) {
            if (awsConfigRuleConfig['excl-regions'].includes(region)) {
              continue;
            }
            const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
            if (!accountStack) {
              console.warn(`Cannot find account stack ${accountKey} in region ${region}`);
              continue;
            }
            const configRuleName = createName({
              name: ruleName,
              suffixLength: 0,
            });
            const configRule = new awsConfig.ManagedRule(accountStack, `ConfigRule-${ruleName}`, {
              identifier: ruleName,
              configRuleName: configRuleName,
              description: configRuleName,
              inputParameters: {
                s3BucketNames: 'pbmmaccel-logarchive-phase0-aescacentral1-hlw0skn2oem',
              }
            });
            const parameters = {
              AutomationAssumeRole: {
                StaticValue: {
                  Values: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${acceleratorExecutionRoleName}`],
                }
              },
              LogDestination: {
                StaticValue: {
                  Values: ['pbmmaccel-logarchive-phase0-aescacentral1-hlw0skn2oem']
                }
              },
              LoadBalancer: {
                ResourceValue: {
                  Value: 'RESOURCE_ID'
                }
              }
            };
            new awsConfig.CfnRemediationConfiguration(accountStack, `ConfigRuleRemediation-${ruleName}`, {
                configRuleName: configRule.configRuleName,
                targetId: `arn:aws:ssm:ca-central-1:385884971927:document/PBMMAccel-SSM-ELB-Enable-Logging-81a4a3ec`,
                targetType: 'SSM_DOCUMENT',
                parameters,
            });
          }
        }
      }
    }
  };

}
