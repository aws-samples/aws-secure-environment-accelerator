import { readFile, writeFile } from 'fs/promises';
import { Account } from './common/outputs/accounts';
import { DynamoDB } from './common/aws/dynamodb';
import { Environment, getEnvironments, loadAccounts } from './common/utils/accounts';
import { loadAseaConfig } from './asea-config/load';
import { Config } from './config';
import { CloudWatchLogs } from 'aws-sdk';
import { STS } from './common/aws/sts';
import { AcceleratorConfig } from './asea-config';
import { throttlingBackOff } from './common/aws/backoff';

export class Compare {
  homeRegion: string;
  assumeRoleName: string;
  configRepositoryName: string;
  accountList: Account[];
  enabledRegions: string[];
  sts: STS;
  constructor(
    config: Config,
    compareConfig: { accountList: Account[]; enabledRegions: string[]; acceleratorConfig: AcceleratorConfig },
  ) {
    this.homeRegion = config.homeRegion;
    this.sts = new STS();
    this.assumeRoleName = config.assumeRoleName ?? 'OrganizationAccountAccessRole';
    this.configRepositoryName = config.repositoryName;
    this.accountList = compareConfig.accountList;
    this.enabledRegions = compareConfig.enabledRegions;
  }
  static async init(config: Config) {
    const accountList = await loadAccounts(config.parametersTableName, new DynamoDB(undefined, config.homeRegion));
    const acceleratorConfig = await loadAseaConfig({
      filePath: 'raw/config.json',
      repositoryName: config.repositoryName,
      defaultRegion: config.homeRegion,
    });
    const enabledRegions = acceleratorConfig['global-options']['supported-regions'];

    const compare = new Compare(config, { accountList, enabledRegions, acceleratorConfig });
    return compare;
  }
  static async compareMappings(originalMappingPath: string, newMappingPath: string) {
    const originalMappingString = await readFile(originalMappingPath, 'utf8');
    const newMappingString = await readFile(newMappingPath, 'utf8');

    const originalMapping = JSON.parse(originalMappingString);
    const newMapping = JSON.parse(newMappingString);

    const newMappingKeys = Object.keys(newMapping);
    const missingKeys = newMappingKeys.filter((key) => !originalMapping[key]);
    const missingMappings = missingKeys.reduce((acc: any, key: string) => {
      acc[key] = newMapping[key];
      return acc;
    }, {});
    await writeFile('./outputs/missing-mappings.json', JSON.stringify(missingMappings, null, 2));
    console.log(`Missing mappings written to ./outputs/missing-mappings.json`);
  }
  async GetSubscriptionFilterDeliveryArns(destinationArnMatch: string) {
    const environments = getEnvironments(this.accountList, this.enabledRegions);
    const logsClientMap = await this.getLogsClientMap(environments);
    const logGroupsPromises = environments.map((environment) =>
      this.getLogGroups(logsClientMap, environment.accountId, environment.region),
    );
    const logGroups = await Promise.all(logGroupsPromises);
    const driftPromises = logGroups.map((logGroup) =>
      this.getSubscriptionFiltersDrifts(
        logGroup.account,
        logGroup.region,
        logGroup.cwl!,
        logGroup.logGroups,
        destinationArnMatch,
      ),
    );
    const subscriptionFilterDrifts = await Promise.all(driftPromises);
    await writeFile(
      './outputs/subscription-filter-drifts.json',
      JSON.stringify(subscriptionFilterDrifts.flat(), null, 2),
    );
  }

  async getLogGroups(logsClientMap: Map<string, CloudWatchLogs>, account: string, region: string) {
    const cwl = logsClientMap.get(`${account}-${region}`);
    const logGroups = [];
    let nextToken: string | undefined;
    do {
      const logGroupResponse = await throttlingBackOff(() => cwl!.describeLogGroups({ nextToken }).promise());
      if (logGroupResponse.logGroups) {
        const logGroupNames = logGroupResponse.logGroups.map((logGroup) => logGroup.logGroupName);
        const definedLogGroups = logGroupNames.filter((logGroupName) => logGroupName !== undefined);
        logGroups.push(...definedLogGroups);
      }
    } while (nextToken);
    return { logGroups, account, region, cwl };
  }

  async getSubscriptionFiltersDrifts(
    account: string,
    region: string,
    cwl: CloudWatchLogs,
    logGroups: (string | undefined)[],
    destinationArnMatch: string,
  ) {
    const validLogGroups = logGroups.filter((logGroup) => logGroup !== undefined);
    const subscriptionFilterDriftPromises = validLogGroups.map((validLogGroup) =>
      this.getSubscriptionFilterDrift(account, region, validLogGroup!, cwl, destinationArnMatch),
    );
    const subscriptionFilterDrifts = await Promise.all(subscriptionFilterDriftPromises);
    return subscriptionFilterDrifts.filter((subscriptionFilterDrift) => subscriptionFilterDrift !== undefined);
  }

  async getSubscriptionFilterDrift(
    account: string,
    region: string,
    logGroupName: string,
    cwlClient: CloudWatchLogs,
    destinationArnMatch: string,
  ) {
    const describeLogGroupFilterResponse = await throttlingBackOff(() =>
      cwlClient.describeSubscriptionFilters({ logGroupName }).promise(),
    );
    const subscriptionFilters = describeLogGroupFilterResponse.subscriptionFilters;
    if (!subscriptionFilters || subscriptionFilters.length === 0) {
      return {
        account: account,
        region: region,
        logGroupName: logGroupName,
        subscriptionFilterDrift: ['NO SUBSCRIPTION FILTER FOUND'],
      };
    }

    const subscriptionFiltersDrift = subscriptionFilters.filter(
      (subscriptionFilter) => !subscriptionFilter.destinationArn?.includes(destinationArnMatch),
    );
    if (subscriptionFiltersDrift.length > 0) {
      return {
        account: account,
        region: region,
        logGroupName: logGroupName,
        subscriptionFilterDrift: subscriptionFiltersDrift.map(
          (subscriptionFilter) => subscriptionFilter.destinationArn,
        ),
      };
    }
    return undefined;
  }

  async getAccountListFromDDB(parametersTableName: string, region: string) {
    let accounts: Account[] = [];
    const dynamodb = new DynamoDB(undefined, region);
    accounts = await loadAccounts(parametersTableName, dynamodb);
    return accounts;
  }

  async getLogsClientMap(environments: Environment[]) {
    const logsClientMap = new Map<string, CloudWatchLogs>();
    const logsClientPromises = [];
    for (const environment of environments) {
      logsClientPromises.push(this.createLogsClients(this.assumeRoleName, environment.accountId, environment.region));
    }
    const logsClients = await Promise.all(logsClientPromises);
    logsClients.forEach((client) => {
      logsClientMap.set(`${client.accountId}-${client.region}`, client.cwl);
    });

    return logsClientMap;
  }

  async createLogsClients(assumeRoleName: string, accountId: string, region: string) {
    const credentials = await this.sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const cwl = new CloudWatchLogs({ credentials, region });
    return {
      accountId,
      region,
      cwl,
    };
  }
}
