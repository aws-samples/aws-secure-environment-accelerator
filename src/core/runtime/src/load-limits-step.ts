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

import { ServiceQuotas } from '@aws-accelerator/common/src/aws/service-quotas';
import { getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { Limit, LimitOutput } from '@aws-accelerator/common-outputs/src/limits';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getUpdateItemInput } from './utils/dynamodb-requests';
import { loadAccounts } from './utils/load-accounts';

export interface LoadLimitsInput extends LoadConfigurationInput {
  parametersTableName: string;
  itemId: string;
  assumeRoleName: string;
}

interface LimitCode {
  serviceCode: string;
  quotaCode: string;
  enabled: boolean;
}

const LIMITS: { [limitKey: string]: LimitCode } = {
  [Limit.Ec2Eips]: {
    serviceCode: 'ec2',
    quotaCode: 'L-0263D0A3',
    enabled: true,
  },
  [Limit.VpcPerRegion]: {
    serviceCode: 'vpc',
    quotaCode: 'L-F678F1CE',
    enabled: true,
  },
  [Limit.VpcInterfaceEndpointsPerVpc]: {
    serviceCode: 'vpc',
    quotaCode: 'L-29B6F2EB',
    enabled: true,
  },
  [Limit.CloudFormationStackCount]: {
    serviceCode: 'cloudformation',
    quotaCode: 'L-0485CB21',
    enabled: true,
  },
  [Limit.CloudFormationStackSetPerAdmin]: {
    serviceCode: 'cloudformation',
    quotaCode: 'L-EC62D81A',
    enabled: true,
  },
  [Limit.OrganizationsMaximumAccounts]: {
    serviceCode: 'organizations',
    quotaCode: 'L-29A0C5DF',
    enabled: false,
  },
};

const dynamodb = new DynamoDB();

export const handler = async (input: LoadLimitsInput) => {
  console.log(`Loading limits...`);
  console.log(JSON.stringify(input, null, 2));

  const { configRepositoryName, configFilePath, parametersTableName, assumeRoleName, configCommitId, itemId } = input;

  const accounts = await loadAccounts(parametersTableName, dynamodb);

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const defaultRegion: string = config['global-options']['aws-org-management'].region;

  // Capture limit results
  const limits: LimitOutput[] = [];

  const accountConfigs = config.getAccountConfigs();
  const sts = new STS();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const accountId = getAccountId(accounts, accountKey);

    if (!accountId) {
      console.warn(`Cannot find account with accountKey ${accountKey}`);
      continue;
    }

    const regions: string[] = Array.from(
      new Set(
        config
          .getVpcConfigs()
          .filter(vc => vc.accountKey === accountKey)
          .map(accConfig => accConfig.vpcConfig.region),
      ),
    );

    if (!regions.includes(defaultRegion)) {
      regions.push(defaultRegion);
    }

    // First check that all limits in the config exist
    const limitConfig = accountConfig.limits;
    const limitKeysFromConfig = Object.keys(limitConfig);
    for (const limitKey of limitKeysFromConfig) {
      const code = LIMITS[limitKey];
      if (!code) {
        console.warn(`Cannot find limit code with key "${limitKey}"`);
        continue;
      }
    }

    for (const region of regions) {
      const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
      const quotas = new ServiceQuotas(credentials, region);

      // The fetch all supported limits and request an increase if necessary
      for (const [limitKey, limitCode] of Object.entries(LIMITS)) {
        if (!limitKeysFromConfig.includes(limitKey)) {
          console.info(`Cannot find limit with key "${limitKey}" in accelerator config`);
          continue;
        }
        if (!limitCode.enabled) {
          console.warn(`The limit "${limitKey}" is not enabled`);
          continue;
        }

        const quota = await quotas.getServiceQuotaOrDefault({
          ServiceCode: limitCode.serviceCode,
          QuotaCode: limitCode.quotaCode,
        });
        let value = quota.Value!;
        const accountLimitConfig = limitConfig[limitKey];
        if (accountLimitConfig && accountLimitConfig['customer-confirm-inplace']) {
          value = accountLimitConfig.value;
        }

        // Keep track of limits so we can return them at the end of this function
        limits.push({
          accountKey,
          limitKey,
          serviceCode: limitCode.serviceCode,
          quotaCode: limitCode.quotaCode,
          value,
          region,
        });

        if (!accountLimitConfig) {
          console.debug(`Quota "${limitKey}" has no desired value for account "${accountKey}"`);
          continue;
        }

        const desiredValue = accountLimitConfig.value;

        if (value >= desiredValue) {
          console.debug(`Quota "${limitKey}" already has a value equal or larger than the desired value`);
          continue;
        }
        if (!quota.Adjustable) {
          console.warn(`Quota "${limitKey}" is not adjustable`);
          continue;
        }

        if (region === defaultRegion) {
          // Request the increase or renew if the previous request was more than two days ago
          await quotas.renewServiceQuotaIncrease({
            ServiceCode: limitCode.serviceCode,
            QuotaCode: limitCode.quotaCode,
            DesiredValue: desiredValue,
            MinTimeBetweenRequestsMillis: 1000 * 60 * 60 * 24 * 2, // Two days in milliseconds
          });
        }
      }
    }
  }

  // Store the limits in the dynamodb
  await dynamodb.updateItem(getUpdateItemInput(parametersTableName, itemId, JSON.stringify(limits, null, 2)));
};
