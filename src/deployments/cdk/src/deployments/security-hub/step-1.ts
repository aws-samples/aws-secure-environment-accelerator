/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { SecurityHub } from '@aws-accelerator/cdk-constructs/src/security-hub';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import * as cdk from 'aws-cdk-lib';
import * as eventBridge from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

import path from 'path';

export interface SecurityHubStep1Props {
  accounts: Account[];
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
  acceleratorPrefix?: string;
}

/**
 *
 * @param props
 * @returns
 *
 * Enables SecurityHub in Audit Account also send invites
 * to sub accounts in all regions excluding security-hub-excl-regions
 */
export async function step1(props: SecurityHubStep1Props) {
  const { accounts, accountStacks, config, outputs, acceleratorPrefix } = props;
  const globalOptions = config['global-options'];
  if (!globalOptions['central-security-services']['security-hub']) {
    return;
  }
  const regions = globalOptions['supported-regions'];
  const securityAccountKey = config.getMandatoryAccountKey('central-security');
  const securityMasterAccount = accounts.find(a => a.key === securityAccountKey);
  if (!securityMasterAccount) {
    console.log(`Did not find Security Account in Accelerator Accounts`);
    return;
  }
  const subAccountIds = accounts.map(account => ({
    AccountId: account.id,
    Email: account.email,
  }));

  const securityHubRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: securityAccountKey,
    roleKey: 'SecurityHubRole',
  });
  if (!securityHubRoleOutput) {
    return;
  }

  const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: securityAccountKey,
    roleKey: 'LogGroupRole',
  });

  if (!logGroupLambdaRoleOutput) {
    console.warn(`Cannot find required LogGroupLambda role in account "${securityAccountKey}"`);
    return;
  }
  const logGroupLambdaRoleArn = logGroupLambdaRoleOutput.roleArn;

  const securityHubLambdaSWLRole = createPublishingLambdaRole(accountStacks, securityAccountKey, acceleratorPrefix);

  const securityHubExclRegions = globalOptions['central-security-services']['security-hub-excl-regions'] || [];
  for (const region of regions) {
    if (securityHubExclRegions.includes(region)) {
      console.info(`Security Hub is disabled in region "${region}" based on global-options/security-hub-excl-regions'`);
      continue;
    }
    const securityMasterAccountStack = accountStacks.tryGetOrCreateAccountStack(securityAccountKey, region);
    if (!securityMasterAccountStack) {
      console.warn(`Cannot find security stack in region ${region}`);
    } else {
      // Create Security Hub stack for Master Account in Security Account
      new SecurityHub(securityMasterAccountStack, `SecurityHubMasterAccountSetup`, {
        account: securityMasterAccount,
        standards: globalOptions['security-hub-frameworks'],
        subAccountIds,
        roleArn: securityHubRoleOutput.roleArn,
      });

      if (acceleratorPrefix && logGroupLambdaRoleArn) {
        configureSecurityHubCWLs(
          acceleratorPrefix,
          logGroupLambdaRoleArn,
          securityMasterAccountStack,
          securityHubLambdaSWLRole?.roleArn,
        );
      }
    }
  }
}

const createPublishingLambdaRole = (
  accountStacks: AccountStacks,
  securityAccountKey: string,
  acceleratorPrefix?: string,
): iam.Role | undefined => {
  const securityMasterAccountStackDefaultRegion = accountStacks.tryGetOrCreateAccountStack(securityAccountKey);
  if (!securityMasterAccountStackDefaultRegion) {
    console.warn(`Cannot find security stack in default region`);
    return;
  }

  const lambdaRoleName = `${acceleratorPrefix}SecurityHubPublisherRole`;
  const lambdaRole = new iam.Role(securityMasterAccountStackDefaultRegion, 'SecurityHubPublisherRole', {
    roleName: lambdaRoleName,
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  lambdaRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'],
      resources: ['*'],
    }),
  );

  return lambdaRole;
};

const configureSecurityHubCWLs = (
  acceleratorPrefix: string,
  logGroupLambdaRoleArn: string,
  securityMasterAccountStack: AccountStack,
  securityHubLambdaSWLRoleArn?: string,
) => {
  const acceleratorPrefixNoDash = acceleratorPrefix.slice(0, -1);
  const logGroupName = `/${acceleratorPrefixNoDash}/SecurityHub`;

  if (securityHubLambdaSWLRoleArn) {
    new LogGroup(securityMasterAccountStack, `SecurithHubLogGroup`, {
      logGroupName,
      roleArn: logGroupLambdaRoleArn,
    });

    const cloudwatchrule = new eventBridge.Rule(securityMasterAccountStack, `SecurityHubEvents`, {
      ruleName: `${acceleratorPrefix}SecurityHubFindingsImportToCWLs`,
      description: 'Sends all Security Hub Findings to a Lambda that writes to CloudWatch Logs',
      eventPattern: {
        source: ['aws.securityhub'],
        detailType: ['Security Hub Findings - Imported'],
      },
    });

    const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const lambdaCode = lambda.Code.fromAsset(lambdaDir);

    const lambdaRole = iam.Role.fromRoleArn(
      securityMasterAccountStack,
      `SecurityHubPublisherLambdaRole`,
      securityHubLambdaSWLRoleArn,
      {
        mutable: true,
      },
    );

    const eventsToCwlLambda = new lambda.Function(securityMasterAccountStack, `SecurityHubPublisher`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      role: lambdaRole,
      code: lambdaCode,
      handler: 'index.eventToCWLPublisher',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1048,
      environment: {
        LOG_GROUP_NAME: logGroupName,
      },
    });

    cloudwatchrule.addTarget(new targets.LambdaFunction(eventsToCwlLambda));
  }
};
