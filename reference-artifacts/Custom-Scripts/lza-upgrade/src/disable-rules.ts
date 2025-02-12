/**
 *  Copyright 2025 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Account } from './common/outputs/accounts';
import { DynamoDB } from './common/aws/dynamodb';
import { Environment, getEnvironments, loadAccounts } from './common/utils/accounts';
import { loadAseaConfig } from './asea-config/load';
import { Config } from './config';
import { AcceleratorConfig } from './asea-config';
import { STS } from './common/aws/sts';
import { throttlingBackOff } from './common/aws/backoff';
import { EventBridgeClient, DisableRuleCommand, ResourceNotFoundException } from '@aws-sdk/client-eventbridge';

export class DisableRules {
    homeRegion: string;
    assumeRoleName: string;
    configRepositoryName: string;
    accountList: Account[];
    enabledRegions: string[];
    sts: STS;
    constructor(config: Config, 
        disableRuleConfig: { accountList: Account[], enabledRegions: string[], acceleratorConfig: AcceleratorConfig },
    ) {
      this.homeRegion = config.homeRegion;
      this.sts = new STS();
      this.assumeRoleName = config.assumeRoleName ?? 'OrganizationAccountAccessRole';
      this.configRepositoryName = config.repositoryName;
      this.accountList = disableRuleConfig.accountList;
      this.enabledRegions = disableRuleConfig.enabledRegions;
    }

    static async init(config: Config) {
        const accountList = await loadAccounts(config.parametersTableName, new DynamoDB(undefined, config.homeRegion));
        const acceleratorConfig = await loadAseaConfig({
            filePath: 'raw/config.json',
            repositoryName: config.repositoryName,
            defaultRegion: config.homeRegion,
        });
        const enabledRegions = acceleratorConfig['global-options']['supported-regions'];
        const disableRules = new DisableRules(config, {accountList, enabledRegions, acceleratorConfig});
        return disableRules;
    }
    async disableAllAccountRules(prefix: string) {
      const environments = getEnvironments(this.accountList, this.enabledRegions);
      const eventBridgeClientMap = await this.getEventBridgeClientMap(environments);
      const deleteRulesPromises = environments.map(environment => this.disableEventBridgeRules(eventBridgeClientMap, environment.accountId, environment.region, prefix.replaceAll('-', '')));
      await Promise.all(deleteRulesPromises);
    }
  
    async disableEventBridgeRules(eventBridgeClientMap: Map<string, EventBridgeClient>, accountId: string, region: string, prefix: string,){
        const client = eventBridgeClientMap.get(`${accountId}-${region}`);
        if (!client) {
            throw new Error(`No client found for account ${accountId} and region ${region}`);
        };
        const suffixes = [
            'NewLogGroup_rule'
        ];
        for (const suffix of suffixes) {
            try {
                const command = new DisableRuleCommand({
                Name: `${prefix}-${suffix}`,
                });
                await throttlingBackOff (() => client.send(command));
            } catch (e: any) {
                if (e instanceof ResourceNotFoundException) {
                    continue;
                }
            }
            console.log(`Disabling rule ${prefix}-${suffix} in ${accountId}-${region}`);
        }
    }

  async getEventBridgeClientMap(environments: Environment[]) {
    const eventBridgeClientMap = new Map<string, EventBridgeClient>();
    const promises = [];
    for (const environment of environments) {
        promises.push(this.createEventBridgeClients(this.assumeRoleName, environment.accountId, environment.region));
    }
    const eventBridgeClients = await Promise.all(promises);
    eventBridgeClients.forEach((client) => {
        eventBridgeClientMap.set(`${client.accountId}-${client.region}`, client.client);
    });
    return eventBridgeClientMap;
  }

  async createEventBridgeClients(assumeRoleName: string, accountId: string, region: string) {
    const credentials = await this.sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const client = new EventBridgeClient({ credentials, region });
    return {
        accountId,
        region,
        client,
    };
  }
}