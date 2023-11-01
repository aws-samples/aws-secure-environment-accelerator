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

import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from 'aws-cdk-lib';
import { createName, createSnsTopicName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as events from 'aws-cdk-lib/aws-events';

export interface CloudWatchStep3Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

const SnsFindingTypesDict = {
  Low: {
    Low: 'LOW',
    Medium: 'MEDIUM',
    High: ['HIGH', 'CRITICAL'],
  },
  Medium: {
    Medium: 'MEDIUM',
    High: ['HIGH', 'CRITICAL'],
  },
  High: {
    High: ['HIGH', 'CRITICAL'],
  },
  Critical: {
    High: 'CRITICAL',
  },
  None: [],
};

/**
 * Creates Cloudwatch Event Rules for Security Hub Findings - Imported in "central-security-services" account
 * @param props
 * @returns
 */
export async function step3(props: CloudWatchStep3Props) {
  const { accountStacks, config } = props;
  const globalOptions = config['global-options'];
  const centralSecurityServices = globalOptions['central-security-services'];
  const centralLogServices = globalOptions['central-log-services'];
  const supportedRegions = config['global-options']['supported-regions'];
  const excludeRegions = centralLogServices['sns-excl-regions'];
  const regions = supportedRegions.filter(r => !excludeRegions?.includes(r));

  if (centralSecurityServices['security-hub-findings-sns'] === 'None') {
    return;
  }

  for (const region of regions) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(centralSecurityServices.account, region);
    if (!accountStack) {
      console.error(
        `Cannot find account stack ${centralSecurityServices.account}: ${centralSecurityServices.region}, while deploying Security Hub Findings - Imported Event Rule`,
      );
      return;
    }
    const securityFindingsSeverities = SnsFindingTypesDict[centralSecurityServices['security-hub-findings-sns']];
    for (const [snsTopicName, severities] of Object.entries(securityFindingsSeverities)) {
      const severityLabels: string[] = [];
      if (typeof severities === 'string') {
        severityLabels.push(severities);
      } else {
        severityLabels.push(...severities);
      }

      const securityHubImportEventPattern = {
        source: ['aws.securityhub'],
        'detail-type': ['Security Hub Findings - Imported'],
        detail: {
          findings: {
            Severity: {
              Label: severityLabels,
            },
            Workflow: {
              Status: ['NEW'],
            },
          },
        },
      };

      const ruleTarget: events.CfnRule.TargetProperty = {
        arn: `arn:aws:sns:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${createSnsTopicName(snsTopicName)}`,
        id: 'SecurityHubFindingsImportTarget',
      };

      new events.CfnRule(accountStack, `SecurityHubFindingsImportRule-${snsTopicName}`, {
        description: 'Sends Security Hub Findings - Imported event to SNS topic',
        state: 'ENABLED',
        name: createName({
          name: `SecurityHubFindingsImport${snsTopicName}_rule`,
        }),
        eventPattern: securityHubImportEventPattern,
        targets: [ruleTarget],
      });
    }
  }
}
