import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as awsConfig from '@aws-cdk/aws-config';
import { Account, getAccountId } from '../../utils/accounts';
import { getStackJsonOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LogBucketOutput, AccountBucketOutputFinder } from '../defaults/outputs';
import { CustomRule, CustomRuleProps } from '@aws-accelerator/cdk-constructs/src/config';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import * as fs from 'fs';
import * as path from 'path';
import * as tempy from 'tempy';
import { IamPolicyOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

export interface ConfigRuleArtifactsOutput {
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

export interface CreateRuleProps {
  acceleratorExecutionRoleName: string;
  config: c.AcceleratorConfig;
  accountStacks: AccountStacks;
  accounts: Account[];
  outputs: StackOutput[];
  defaultRegion: string;
}

const configRulesTempDir = tempy.directory();
export async function createRule(props: CreateRuleProps) {
  const { acceleratorExecutionRoleName, config, accountStacks, accounts, outputs, defaultRegion } = props;
  const awsConfigConf = config['global-options']['aws-config'];
  if (!awsConfigConf) {
    return;
  }

  const configRules = awsConfigConf.rules;
  const configRuleDefaults = awsConfigConf.defaults;
  let configRuleArtifact: ConfigRuleArtifactsOutput | undefined;
  const configRuleArtifactOutputs: ConfigRuleArtifactsOutput[] = getStackJsonOutput(outputs, {
    accountKey: config.getMandatoryAccountKey('master'),
    outputType: 'ConfigRulesArtifactsOutput',
  });

  if (configRuleArtifactOutputs.length > 0) {
    configRuleArtifact = configRuleArtifactOutputs[0];
  }

  const customRules =
    config['global-options']['aws-config']?.rules
      .filter(r => r.type === 'custom')
      .map(r => r['runtime-path'] || r.name.toLowerCase())
      .map(r => (r.endsWith('.zip') ? r : r + '.zip')) || [];
  if (configRuleArtifact) {
    await downloadCustomRules(
      getAccountId(accounts, config.getMandatoryAccountKey('master'))!,
      acceleratorExecutionRoleName,
      customRules,
      configRuleArtifact.bucketName,
      configRuleArtifact.keyPrefix,
    );
  }

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
              accountKey,
              defaultRegion,
            });
            let configRule;
            if (awsConfigRule.type === 'managed') {
              configRule = new awsConfig.ManagedRule(accountStack, `ConfigRule-${ruleName}`, {
                identifier: ruleName,
                configRuleName,
                description: configRuleName,
                inputParameters: configParams,
              });
            } else {
              if (!configRuleArtifact) {
                console.error('ConfigRuleArtifact is not found to create Custom ConfigRule');
                continue;
              }
              const configRuleRuntime = awsConfigRule['runtime-path'] || awsConfigRule.name.toLowerCase();
              const ruleProps: CustomRuleProps = {
                roleArn: `arn:${cdk.Aws.PARTITION}:iam::${cdk.Aws.ACCOUNT_ID}:role/${acceleratorExecutionRoleName}`,
                configRuleName,
                description: configRuleName,
                inputParameters: configParams,
                ruleScope: {
                  resourceTypes: awsConfigRule['resource-types'].map(r => awsConfig.ResourceType.of(r)),
                },
                maximumExecutionFrequency: awsConfigRule['max-frequency']
                  ? (awsConfigRule['max-frequency'] as awsConfig.MaximumExecutionFrequency)
                  : undefined,
                periodic: !!awsConfigRule['max-frequency'],
                configurationChanges: !!awsConfigRule['resource-types'].length,
                runtimeFileLocation: path.join(configRulesTempDir, configRuleRuntime),
                lambdaRuntime: awsConfigRule.runtime!,
              };
              configRule = new CustomRule(accountStack, `ConfigRule-${ruleName}`, ruleProps).resource;
            }
            if (!awsConfigRuleConfig['remediate-regions']?.includes(region)) {
              continue;
            }

            if (!remediation || !awsConfigRule['remediation-action']) {
              continue;
            }
            const remediationAction = awsConfigRule['remediation-action'];

            const ssmDocumentsConfig = config['global-options']['ssm-automation'];
            const remediationActionName = createName({
              name: remediationAction,
              suffixLength: 0,
            });
            let targetId = remediationActionName;
            const ssmDocInGlobalOptions = ssmDocumentsConfig.find(
              d =>
                d.documents.find(dc => dc.name === remediationAction) &&
                d.regions.includes(region) &&
                d.accounts.includes(accountKey),
            );
            if (!ssmDocInGlobalOptions) {
              const ssmDocInAccount = accountConfig['ssm-automation'].find(d =>
                d.documents.includes(remediationAction),
              );
              if (ssmDocInAccount) {
                targetId = `arn:aws:ssm:${cdk.Aws.REGION}:${getAccountId(
                  accounts,
                  ssmDocInAccount.account,
                )}:document/${remediationActionName}`;
              } else {
                const ssmDocInOu = ouConfig['ssm-automation'].find(d => d.documents.includes(remediationAction));
                if (ssmDocInOu) {
                  targetId = `arn:aws:ssm:${cdk.Aws.REGION}:${getAccountId(
                    accounts,
                    ssmDocInOu.account,
                  )}:document/${remediationActionName}`;
                } else if (config['global-options']['default-ssm-documents'].includes(remediationAction)) {
                  targetId = remediationAction;
                } else {
                  console.warn(
                    `No Remediation "${remediationAction}"is Created in account "${accountKey}" and region "${region}"`,
                  );
                  continue;
                }
              }
            } else if (ssmDocInGlobalOptions) {
              targetId = remediationActionName;
            } else if (config['global-options']['default-ssm-documents'].includes(remediationAction)) {
              targetId = remediationAction;
            } else {
              console.warn(
                `Invalid SSM-Document given in "remediation-action" for AWS Config Rule ${awsConfigRule.name}, ${accountKey}`,
              );
              continue;
            }

            const remediationParams = getRemediationParameters({
              outputs,
              remediationParams: awsConfigRule['remediation-params'],
              roleName: acceleratorExecutionRoleName,
              config,
              accountKey,
              defaultRegion,
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
  accountKey: string;
  defaultRegion: string;
}): RemediationParameters {
  const reutrnParams: RemediationParameters = {};
  const { outputs, remediationParams, roleName, config, accountKey, defaultRegion } = params;
  reutrnParams.AutomationAssumeRole = {
    StaticValue: {
      Values: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${remediationParams.AutomationAssumeRole || roleName}`],
    },
  };

  Object.keys(remediationParams).map(key => {
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
              Values: [
                getParameterValue({
                  paramKey: replaceKey,
                  outputs,
                  config,
                  accountKey,
                  defaultRegion,
                }),
              ],
            },
          };
        } else {
          reutrnParams[key] = {
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
  accountKey: string;
  defaultRegion: string;
}): { [key: string]: string } {
  const { config, outputs, ruleParams, accountKey, defaultRegion } = params;
  Object.keys(ruleParams).map(key => {
    /* eslint-disable no-template-curly-in-string */
    const ruleParamMatch = ruleParams[key].match('\\${SEA::([a-zA-Z0-9-]*)}');
    if (ruleParamMatch) {
      const replaceKey = ruleParamMatch[1];
      const replaceValue = getParameterValue({
        paramKey: replaceKey,
        outputs,
        config,
        accountKey,
        defaultRegion,
      });
      ruleParams[key] = ruleParams[key].replace(new RegExp('\\${SEA::[a-zA-Z0-9-]*}', 'g'), replaceValue);
    }
    /* eslint-enable */
  });
  return ruleParams;
}

export function getParameterValue(props: {
  paramKey: string;
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
  accountKey: string;
  defaultRegion: string;
}): string {
  const { accountKey, config, outputs, paramKey, defaultRegion } = props;
  switch (paramKey) {
    case 'LogArchiveAesBucket': {
      return LogBucketOutput.getBucketDetails({
        config,
        outputs,
      }).name;
    }
    case 'S3BucketEncryptionKey': {
      const accountBucket = AccountBucketOutputFinder.tryFindOne({
        outputs,
        accountKey,
        region: defaultRegion,
      });
      return `arn:aws:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:alias/${accountBucket?.encryptionKeyName}`;
    }
    case 'EC2InstaceProfilePermissions': {
      const ssmPolicyOutput = IamPolicyOutputFinder.findOneByName({
        outputs,
        accountKey,
        policyKey: 'IamSsmWriteAccessPolicy',
      });
      if (!ssmPolicyOutput) {
        console.warn(`Didn't find IAM SSM Log Archive Write Access Policy in output`);
        return '';
      }
      return ssmPolicyOutput.policyName;
    }
    default: {
      return '';
    }
  }
}

async function downloadCustomRules(
  accountId: string,
  roleName: string,
  fileNames: string[],
  bucketName: string,
  rulePrefix: string,
) {
  const sts = new STS();
  const masterAcctCredentials = await sts.getCredentialsForAccountAndRole(accountId, roleName);
  const s3 = new S3(masterAcctCredentials);
  for (const configRuleRuntime of fileNames) {
    const runtimeFile = await s3.getObjectBody({
      Bucket: bucketName,
      Key: `${rulePrefix}/${configRuleRuntime}`,
    });
    fs.writeFileSync(path.join(configRulesTempDir, configRuleRuntime), runtimeFile);
  }
}
