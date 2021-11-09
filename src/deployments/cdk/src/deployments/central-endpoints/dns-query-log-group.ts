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

import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';

import { VpcConfig } from '@aws-accelerator/common-config';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { DNS_LOGGING_LOG_GROUP_REGION } from '@aws-accelerator/common/src/util/constants';
import { pascalCase } from 'pascal-case';
import { AccountStacks } from '../../common/account-stacks';
import { createR53LogGroupName } from './step-1';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import { LogResourcePolicy } from '@aws-accelerator/custom-resource-logs-resource-policy';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface CreateDnsQueryLogGroupProps {
  vpcConfig: VpcConfig;
  accountKey: string;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
  acceleratorPrefix: string;
  createPolicy: boolean;
}

export async function createDnsQueryLogGroup(props: CreateDnsQueryLogGroupProps) {
  const { acceleratorPrefix, accountKey, vpcConfig, accountStacks, outputs, createPolicy } = props;
  if (!vpcConfig.zones || !vpcConfig.zones.public) {
    return;
  }
  const zonesStack = accountStacks.getOrCreateAccountStack(accountKey, DNS_LOGGING_LOG_GROUP_REGION);
  const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey,
    roleKey: 'LogGroupRole',
  });

  if (!logGroupLambdaRoleOutput) {
    console.warn(`LogGroupRole not found in account "${accountKey}"`);
    return;
  }
  const logGroups =
    vpcConfig.zones.public.map(phz => {
      const logGroupName = createR53LogGroupName({
        acceleratorPrefix,
        domain: phz,
      });
      return new LogGroup(zonesStack, `Route53HostedZoneLogGroup${pascalCase(phz)}`, {
        logGroupName,
        roleArn: logGroupLambdaRoleOutput.roleArn,
      });
    }) || [];
  if (logGroups.length > 0 && createPolicy) {
    const wildcardLogGroupName = createR53LogGroupName({
      acceleratorPrefix,
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
