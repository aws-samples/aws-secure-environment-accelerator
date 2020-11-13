import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as awsConfig from '@aws-cdk/aws-config';
import { Account, getAccountId } from '../../utils/accounts';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LogBucketOutput } from '../defaults/outputs';

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

  for (const [ouKey, ouConfig] of config.getOrganizationalUnits()) {
    if (!ouConfig['aws-config']) {
      continue;
    }
    const ouAwsConfigRuleConfigs = ouConfig['aws-config'];
    for (const [accountKey, accountConfig] of config.getAccountConfigsForOu(ouKey)) {
      const awsAccountConfigRuleConfig = accountConfig['aws-config'];
      for (const awsConfigRuleConfig of ouAwsConfigRuleConfigs) {
        for (const ruleName of awsConfigRuleConfig.rules) {
          console.log(
            `Deploying ${ruleName} in Account ${accountKey} and in regions excluding ${awsConfigRuleConfig['excl-regions']}`,
          );
          const awsConfigRule = configRules.find(cr => cr.name === ruleName);
          if (!awsConfigRule) {
            console.warn(`Config Rule ${ruleName} is not found in Accelerator Configuration global-options`);
            continue;
          }
          const remediation =
            awsConfigRule.remediation === undefined ? configRuleDefaults.remediation : awsConfigRule.remediation;
          const remediationAttempts =
            awsConfigRule['remediation-attempts'] || configRuleDefaults['remediation-attempts'];
          const remediationRetrySeconds =
            awsConfigRule['remediation-retry-seconds'] || configRuleDefaults['remediation-retry-seconds'];
          const remediationConcurrency =
            awsConfigRule['remediation-concurrency'] || configRuleDefaults['remediation-concurrency'];
          for (const region of config['global-options']['supported-regions']) {
            if (awsConfigRuleConfig['excl-regions'].includes(region)) {
              continue;
            }
            const isRuleIgnored = awsAccountConfigRuleConfig.find(
              ac => ac['excl-rules'].includes(ruleName) && ac.regions.includes(region),
            );
            if (isRuleIgnored) {
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
            const configParams = getConfigRuleParameters({
              ruleParams: awsConfigRule.parameters,
              config,
              outputs,
            });
            const configRule = new awsConfig.ManagedRule(accountStack, `ConfigRule-${ruleName}`, {
              identifier: ruleName,
              configRuleName,
              description: configRuleName,
              inputParameters: configParams,
            });
            if (!awsConfigRuleConfig['remediate-regions']?.includes(region)) {
              continue;
            }

            if (!remediation || !awsConfigRule['remediation-action']) {
              continue;
            }

            const ssmDocumentsConfig = config['global-options']['ssm-automation'];
            const remediationActionName = createName({
              name: awsConfigRule['remediation-action'],
              suffixLength: 0,
            });
            let targetId = remediationActionName;
            const ssmDocInGlobalOptions = ssmDocumentsConfig.find(
              d =>
                d.documents.find(dc => dc.name === awsConfigRule['remediation-action']) &&
                d.regions.includes(region) &&
                d.accounts.includes(accountKey),
            );
            if (!ssmDocInGlobalOptions) {
              const ssmDocInAccount = accountConfig['ssm-automation'].find(d =>
                d.documents.includes(awsConfigRule['remediation-action']),
              );
              if (ssmDocInAccount) {
                targetId = `arn:aws:ssm:${cdk.Aws.REGION}:${getAccountId(
                  accounts,
                  ssmDocInAccount.account,
                )}:document/${remediationActionName}`;
              } else {
                const ssmDocInOu = ouConfig['ssm-automation'].find(d =>
                  d.documents.includes(awsConfigRule['remediation-action']),
                );
                if (ssmDocInOu) {
                  targetId = `arn:aws:ssm:${cdk.Aws.REGION}:${getAccountId(
                    accounts,
                    ssmDocInOu.account,
                  )}:document/${remediationActionName}`;
                } else {
                  console.warn(`No Remediation is not Created in account "${accountKey}" and region "${region}"`);
                  continue;
                }
              }
            }

            const remediationParams = getRemediationParameters({
              outputs,
              remediationParams: awsConfigRule['remediation-params'],
              roleName: acceleratorExecutionRoleName,
              config,
            });

            new awsConfig.CfnRemediationConfiguration(accountStack, `ConfigRuleRemediation-${ruleName}`, {
              configRuleName: configRule.configRuleName,
              targetId,
              targetType: 'SSM_DOCUMENT',
              parameters: remediationParams,
              automatic: true,
              maximumAutomaticAttempts: remediationAttempts,
              retryAttemptSeconds: remediationRetrySeconds,
            });
          }
        }
      }
    }
  }
}

interface RemediationParameters {
  [key: string]: {
    StaticValue?: {
      Values: string[];
    };
    ResourceValue?: {
      Value: 'RESOURCE_ID';
    };
  };
}

export function getRemediationParameters(params: {
  remediationParams: { [key: string]: string };
  roleName: string;
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
}): RemediationParameters {
  const reutrnParams: RemediationParameters = {};
  const { outputs, remediationParams, roleName, config } = params;
  if (!remediationParams.AutomationAssumeRole) {
    reutrnParams.AutomationAssumeRole = {
      StaticValue: {
        Values: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${roleName}`],
      },
    };
  }

  Object.keys(remediationParams).map(key => {
    console.log(remediationParams[key], remediationParams[key].startsWith('${SEA::'));
    if (remediationParams[key] === 'RESOURCE_ID') {
      reutrnParams[key] = {
        ResourceValue: {
          Value: 'RESOURCE_ID',
        },
      };
    } else {
      if (key === 'AutomationAssumeRole') {
        reutrnParams.AutomationAssumeRole = {
          StaticValue: {
            Values: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${remediationParams[key]}`],
          },
        };
      } else {
        if (remediationParams[key].startsWith('${SEA::')) {
          const replaceKey = remediationParams[key].match('{SEA::(.*)}')?.[1]!;
          reutrnParams[key] = {
            StaticValue: {
              Values: [getParameterValue(replaceKey, outputs, config)],
            },
          };
        } else {
          reutrnParams.AutomationAssumeRole = {
            StaticValue: {
              Values: [remediationParams[key]],
            },
          };
        }
      }
    }
  });
  return reutrnParams;
}

export function getConfigRuleParameters(params: {
  ruleParams: { [key: string]: string };
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
}): { [key: string]: string } {
  const { config, outputs, ruleParams } = params;
  Object.keys(ruleParams).map(key => {
    if (ruleParams[key].startsWith('${SEA::')) {
      const replaceKey = ruleParams[key].match('{SEA::(.*)}')?.[1]!;
      ruleParams[key] = getParameterValue(replaceKey, outputs, config);
    }
  });
  return ruleParams;
}

export function getParameterValue(input: string, outputs: StackOutput[], config: c.AcceleratorConfig): string {
  if (input === 'LogArchiveBucket') {
    return LogBucketOutput.getBucketArn({
      config,
      outputs,
    });
  }
  return '';
}
