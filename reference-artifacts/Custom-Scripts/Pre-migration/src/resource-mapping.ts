/* eslint-disable @typescript-eslint/member-ordering */
import { CloudFormation } from 'aws-sdk';
import { loadAseaConfig } from './asea-config/load';
import aws from './common/aws/aws-client';
import { throttlingBackOff } from './common/aws/backoff';
import { DynamoDB } from './common/aws/dynamodb';
import { STS } from './common/aws/sts';
import { Account } from './common/outputs/accounts';
import { loadAccounts } from './common/utils/accounts';
import { Config } from './config';

interface Environment {
  accountId: string;
  accountKey: string;
  region: string;
}

interface StacksAndResourceMap {
  environment: Environment;
  stackName: string;
  resourceMap: LogicalAndPhysicalResourceIds[];
  region: string;
  template: string;
  phase: string | undefined;
  countVerified: boolean;
  numberOfResources: number;
  numberOfResourcesInTemplate: number;
}

interface CfnClients {
  cfn: CloudFormation;
  cfnNative: aws.CloudFormation;
}

interface LogicalAndPhysicalResourceIds {
  logicalResourceId: string;
  physicalResourceId: string;
  resourceType: string;
  resourceMetadata?: string;
}

interface ASEAResourceMapping {
  accountId: string;
  accountKey: string;
  stacks: string[];
  stacksAndResourceMapList: ASEAMapping[];
}

interface ASEAMapping {
  stackName: string;
  resourceMap: LogicalAndPhysicalResourceIds[];
  region: string;
  template: string;
  phase: string | undefined;
  countVerified: boolean;
  numberOfResources: number;
  numberOfResourcesInTemplate: number;
}

export class ResourceMapping {
  private readonly s3: aws.S3;
  private readonly dynamodb: DynamoDB;
  private sts: STS;
  private readonly region: string;
  private readonly mappingFileBucketName: string;
  private readonly parametersTableName: string;
  private readonly configRepositoryName: string;
  private readonly assumeRoleName: string;
  private driftedResources: any[] = [];
  constructor(config: Config) {
    this.mappingFileBucketName = config.mappingBucketName!;
    this.region = config.homeRegion;
    this.parametersTableName = config.parametersTableName;
    this.configRepositoryName = config.repositoryName;
    this.assumeRoleName = config.assumeRoleName ?? 'OrganizationAccountAccessRole';
    this.dynamodb = new DynamoDB(undefined, this.region);
    this.sts = new STS();
    this.s3 = new aws.S3({
      region: this.region,
    });
  }

  async process() {
    const configFile = await loadAseaConfig({
      filePath: 'raw/config.json',
      repositoryName: this.configRepositoryName,
      defaultRegion: this.region,
    });
    await this.validateS3Bucket(this.mappingFileBucketName);
    const enabledRegions = configFile['global-options']['supported-regions'];
    const accountList = await this.getAccountListFromDDB(this.parametersTableName);
    const environments = this.getEnvironments(accountList, enabledRegions);
    const cfnClients = await this.getCfnClientMap(environments);
    const environmentsStackMap = await this.getEnvironmentStacks(environments, cfnClients);
    const environmentStackAndResourcesMap = await this.getEnvironmentMetaData(environments, environmentsStackMap);
    const aseaMapping = this.createAseaMapping(environmentStackAndResourcesMap, environmentsStackMap);
    await this.detectDrift(environmentStackAndResourcesMap, cfnClients);
    const aseaMappingString = JSON.stringify(aseaMapping, null, 4);
    const driftDetectionCsv = this.convertToCSV(this.driftedResources);
    await this.writeToS3(aseaMappingString, 'mapping.json');
    await this.writeToS3(driftDetectionCsv, 'AllDriftDetectedResources.csv');
  }

  createAseaMapping(stackAndResourceMap: Map<string, StacksAndResourceMap>, stackMap: Map<string, string[]>) {
    const aseaMapping: ASEAResourceMapping[] = [];
    for (let [_key, stackAndResources] of stackAndResourceMap) {
      let mapping = aseaMapping.find((item) => {
        return item.accountId === stackAndResources.environment.accountId;
      });
      const stacks = stackMap.get(`${stackAndResources.environment.accountId}-${stackAndResources.environment.region}`);
      if (!stacks) {
        throw new Error(`No stacks found for environment ${stackAndResources.environment}`);
      }

      if (!mapping) {
        aseaMapping.push({
          accountId: stackAndResources.environment.accountId,
          accountKey: stackAndResources.environment.accountKey,
          stacks,
          stacksAndResourceMapList: [],
        });
        mapping = aseaMapping.find((item) => {
          return item.accountId === stackAndResources.environment.accountId;
        });
      }
      mapping?.stacksAndResourceMapList.push({
        stackName: stackAndResources.stackName,
        region: stackAndResources.region,
        phase: stackAndResources.phase,
        countVerified: stackAndResources.countVerified,
        numberOfResources: stackAndResources.numberOfResources,
        numberOfResourcesInTemplate: stackAndResources.numberOfResourcesInTemplate,
        resourceMap: stackAndResources.resourceMap,
        template: stackAndResources.template,
      });
    }
    return aseaMapping;
  }

  async validateS3Bucket(mappingFileBucketName: string): Promise<void> {
    const s3GetBucketVersioningParams = {
      Bucket: mappingFileBucketName,
    };
    const s3GetBucketVersioningResponse = await this.s3.getBucketVersioning(s3GetBucketVersioningParams).promise();
    const status = s3GetBucketVersioningResponse.Status === 'Enabled' ? true : false;

    if (!status) {
      throw new Error(
        `The Bucket ${mappingFileBucketName} has a versioning status of ${status}. Please, deploy the S3 CloudFormation template, or enable bucket versioning manually.`,
      );
    }
  }

  async getCfnClientMap(environments: Environment[]) {
    const cfnClientMap = new Map<string, CfnClients>();
    const cfnClientPromises = [];
    for (const environment of environments) {
      cfnClientPromises.push(
        this.createCloudFormationClients(this.assumeRoleName, environment.accountId, environment.region),
      );
    }
    const cfnClients = await Promise.all(cfnClientPromises);
    cfnClients.forEach((client) => {
      cfnClientMap.set(`${client.accountId}-${client.region}`, {
        cfn: client.cloudformation,
        cfnNative: client.cfnNative,
      });
    });

    return cfnClientMap;
  }

  async createCloudFormationClients(assumeRoleName: string, accountId: string, region: string) {
    const credentials = await this.assumeRole(accountId, assumeRoleName);
    const cloudformation = new CloudFormation({ credentials, region });
    const cfnNative = new aws.CloudFormation({
      credentials,
      region,
    });

    return {
      accountId,
      region,
      cloudformation,
      cfnNative,
    };
  }
  async getEnvironmentStacks(environments: Environment[], cfnClientMap: Map<string, CfnClients>) {
    const stackMap = new Map<string, string[]>();
    for (const environment of environments) {
      const cfnClients = cfnClientMap.get(`${environment.accountId}-${environment.region}`);
      if (!cfnClients) {
        throw new Error(
          `Could not retrieve cfnclients for account ${environment.accountId} and region ${environment.region}`,
        );
      }
      const stacks = await this.getStackList(cfnClients.cfn);
      stackMap.set(`${environment.accountId}-${environment.region}`, stacks);
    }
    return stackMap;
  }
  async getEnvironmentMetaData(environments: Environment[], stackMap: Map<string, string[]>) {
    const stackAndResourceMap = new Map<string, StacksAndResourceMap>();
    for (const environment of environments) {
      const stackAndResourcesMapPromises = [];
      const cfnClients = await this.createCloudFormationClients(
        this.assumeRoleName,
        environment.accountId,
        environment.region,
      );
      const stacks = stackMap.get(`${environment.accountId}-${environment.region}`);
      if (!stacks) {
        continue;
      }
      for (const stack of stacks) {
        stackAndResourcesMapPromises.push(
          this.getStackMetadata(environment, stack, cfnClients.cloudformation, cfnClients.cfnNative),
        );
      }
      const stackAndResourcesList = await Promise.all(stackAndResourcesMapPromises);
      for (const item of stackAndResourcesList) {
        stackAndResourceMap.set(`${item.environment.accountId}-${item.environment.region}-${item.stackName}`, item);
      }
    }
    return stackAndResourceMap;
  }

  async detectDrift(stackAndResourceMap: Map<string, StacksAndResourceMap>, cfnClientMap: Map<string, CfnClients>) {
    const detectDriftPromises = [];
    for (let [_key, stackAndResources] of stackAndResourceMap) {
      const cfnClients = cfnClientMap.get(
        `${stackAndResources.environment.accountId}-${stackAndResources.environment.region}`,
      );
      if (!cfnClients) {
        throw new Error(`could not find cfnClients for ${stackAndResources.environment}`);
      }
      detectDriftPromises.push(this.getEnvironmentDrift(stackAndResources, cfnClients));
    }
    await Promise.all(detectDriftPromises);
  }

  async getEnvironmentDrift(stackAndResourceMap: StacksAndResourceMap, cfnClients: CfnClients) {
    const driftDetectionResources = await this.getStackDrift(
      cfnClients.cfnNative,
      stackAndResourceMap.stackName,
      stackAndResourceMap.resourceMap,
    );
    const s3Prefix = await this.getS3Prefix(stackAndResourceMap.stackName, stackAndResourceMap.region);
    const driftDetectionCsv = this.convertToCSV(driftDetectionResources);
    const driftDetectionFileName = `${s3Prefix}/${stackAndResourceMap.stackName}-drift-detection.csv`;
    const resourceFileName = `${s3Prefix}/${stackAndResourceMap.stackName}-resources.csv`;
    const resourceFileCSV = this.convertToCSV(stackAndResourceMap.resourceMap);
    for (const resource of driftDetectionResources) {
      if (resource.DriftStatus === 'MODIFIED') {
        this.driftedResources.push({
          Account: stackAndResourceMap.environment.accountId,
          Region: stackAndResourceMap.region,
          StackName: stackAndResourceMap.stackName,
          ...resource,
        });
      }
    }

    await this.writeToS3(driftDetectionCsv, driftDetectionFileName);
    await this.writeToS3(resourceFileCSV, resourceFileName);
  }

  async getStackMetadata(
    environment: Environment,
    stack: string,
    cloudformation: CloudFormation,
    cfnNative: aws.CloudFormation,
  ): Promise<StacksAndResourceMap> {
    const stackResources = await this.describeCloudFormationStack(cloudformation, stack);
    const cfTemplate = await cfnNative
      .getTemplate({
        StackName: stack,
      })
      .promise();

    if (!cfTemplate?.TemplateBody) {
      throw new Error(`No template body found for stack ${stack} in environment ${environment}`);
    }

    let cfTemplateObject = JSON.parse(cfTemplate.TemplateBody);

    const templateResources = cfTemplateObject.Resources;
    const cfTemplateResourceCount = Object.entries(templateResources).length;
    for (const resource of stackResources) {
      if (templateResources[resource.logicalResourceId]) {
        resource.resourceMetadata = templateResources[resource.logicalResourceId];
      }
    }

    const phase = await this.checkStackPhase(stack);
    let countVerified = false;
    if (stackResources.length === cfTemplateResourceCount) {
      countVerified = true;
    }
    return {
      environment,
      resourceMap: stackResources,
      stackName: stack,
      region: environment.region,
      template: cfTemplateObject,
      phase: phase,
      countVerified: countVerified,
      numberOfResources: stackResources.length,
      numberOfResourcesInTemplate: cfTemplateResourceCount,
    };
  }

  async getStackDrift(
    cloudformation: aws.CloudFormation,
    stackName: string,
    listOfResources: LogicalAndPhysicalResourceIds[],
  ) {
    const driftDetectionResourceList: any[] = [];
    let driftDetectionResponse = undefined;
    for (const resource of listOfResources) {
      const detectStackResourceDriftInput = {
        StackName: stackName,
        LogicalResourceId: resource.logicalResourceId,
      };
      try {
        driftDetectionResponse = await throttlingBackOff(() =>
          cloudformation.detectStackResourceDrift(detectStackResourceDriftInput).promise(),
        );
        driftDetectionResourceList.push({
          LogicalResourceId: resource.logicalResourceId,
          DriftStatus: driftDetectionResponse.StackResourceDrift.StackResourceDriftStatus,
          PropertyDifferences: JSON.stringify(driftDetectionResponse.StackResourceDrift.PropertyDifferences) ?? 'None',
        });
      } catch (e: any) {
        if (e.message.includes('Drift detection is not supported')) {
          driftDetectionResourceList.push({
            LogicalResourceId: resource.logicalResourceId,
            DriftStatus: 'NOT_SUPPORTED',
            PropertyDifferences: 'None',
          });
        } else {
          driftDetectionResourceList.push({
            LogicalResourceId: resource.logicalResourceId,
            DriftStatus: e,
            PropertyDifferences: 'None',
          });
        }
      }
    }
    return driftDetectionResourceList;
  }

  async describeCloudFormationStack(cloudformation: CloudFormation, stackName: string) {
    const logicalAndPhysicalResourceIdsList: LogicalAndPhysicalResourceIds[] = [];

    let nextToken: string | undefined;
    do {
      const listResult = await throttlingBackOff(() =>
        cloudformation
          .listStackResources({
            StackName: stackName,
            NextToken: nextToken,
          })
          .promise(),
      );
      if (listResult.StackResourceSummaries) {
        for (const stackResource of listResult.StackResourceSummaries) {
          logicalAndPhysicalResourceIdsList.push({
            logicalResourceId: stackResource.LogicalResourceId,
            physicalResourceId: stackResource.PhysicalResourceId!,
            resourceType: stackResource.ResourceType,
          });
        }
      }
      nextToken = listResult.NextToken;
    } while (nextToken);

    return logicalAndPhysicalResourceIdsList;
  }

  convertToCSV(data: any[]) {
    const csvRows = [];

    /* Get headers as every csv data format
          has header (head means column name)
          so objects key is nothing but column name
          for csv data using Object.key() function.
          We fetch key of object as column name for
          csv */
    const headers = Object.keys(data[0]);

    /* Using push() method we push fetched
             data into csvRows[] array */
    csvRows.push(headers.join(','));

    // Loop to get value of each objects key
    for (const row of data) {
      console.log(`row: ${JSON.stringify(row)}`);
      let val: string;
      const values = headers.map((header) => {
        if (header === 'resourceMetadata' || header === 'PropertyDifferences') {
          val = JSON.stringify(row[header]).replace(/,/g, '|');
        } else {
          val = JSON.stringify(row[header]);
        }
        return `${val}`;
      });

      // To add, separator between each value
      //csvRows.push(values.join('|'));
      csvRows.push(values.join(','));
    }

    /*
     * To add new line for each objects values
     * and this return statement array csvRows
     * to this function.
     */
    return csvRows.join('\n');
  }

  async getStackList(cloudformation: CloudFormation) {
    const stacks: string[] = [];
    const response = await cloudformation
      .listStacks({
        StackStatusFilter: [
          'CREATE_COMPLETE',
          'UPDATE_COMPLETE',
          'UPDATE_ROLLBACK_FAILED',
          'UPDATE_ROLLBACK_COMPLETE',
          'IMPORT_COMPLETE',
        ],
      })
      .promise();
    for (const stackSummary of response.StackSummaries || []) {
      if (stackSummary.StackName.includes('Phase')) {
        stacks.push(stackSummary.StackName);
      }
    }
    return stacks;
  }

  async assumeRole(accountId: string, roleName: string) {
    const credentials = await this.sts.getCredentialsForAccountAndRole(accountId, roleName);
    return credentials;
  }

  async getAccountListFromDDB(parametersTableName: string) {
    let accounts: Account[] = [];
    if (parametersTableName) {
      accounts = await loadAccounts(this.parametersTableName, this.dynamodb);
      return accounts;
    }
    return accounts;
  }

  async getAccountNames(config: any): Promise<string[]> {
    const mandatoryAccountConfigs: [any, any][] = Object.entries(config['mandatory-account-configs']);
    const workloadAccountConfigs: [any, any][] = Object.entries(config['workload-account-configs']);
    const mandatoryAccountNames = mandatoryAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
    const workloadAccountNames = workloadAccountConfigs.map(([_, accountConfig]) => accountConfig['account-name']);
    return [...mandatoryAccountNames, ...workloadAccountNames];
  }

  getEnvironments(accounts: Account[], regions: string[]): Environment[] {
    const accountDiscovery: Environment[] = [];
    for (const account of accounts) {
      for (const region of regions) {
        accountDiscovery.push({
          accountId: account.id,
          accountKey: account.key,
          region,
        });
      }
    }
    return accountDiscovery;
  }

  async getRegionFromConfig(configFile: string): Promise<string[]> {
    const a = this.recursiveSearch(configFile, 'region');
    const regionSet = new Set(a);
    const regionList = Array.from(regionSet.values());

    return regionList;
  }

  async writeToS3(prettifiedMapping: string, fileName: string): Promise<void> {
    try {
      await throttlingBackOff(() =>
        this.s3
          .putObject({
            Body: prettifiedMapping,
            Bucket: this.mappingFileBucketName,
            Key: fileName,
            ServerSideEncryption: 'AES256',
          })
          .promise(),
      );
    } catch (error) {
      console.warn(error);
    }
  }

  recursiveSearch = (obj: any, searchKey: string, results: any[] = []) => {
    const r = results;
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (key === searchKey && typeof value !== 'object') {
        r.push(value);
      } else if (typeof value === 'object') {
        this.recursiveSearch(value, searchKey, r);
      }
    });
    return r;
  };

  async checkStackPhase(stackName: string): Promise<string | undefined> {
    const lowerCaseStackName = stackName.toLowerCase();
    if (lowerCaseStackName.includes('phase-1')) {
      return 'phase--1';
    } else if (lowerCaseStackName.includes('phase-0') || lowerCaseStackName.includes('phase0')) {
      return 'phase-0';
    } else if (lowerCaseStackName.includes('phase1')) {
      return 'phase-1';
    } else if (lowerCaseStackName.includes('phase-2') || lowerCaseStackName.includes('phase2')) {
      return 'phase-2';
    } else if (lowerCaseStackName.includes('phase-3') || lowerCaseStackName.includes('phase3')) {
      return 'phase-3';
    } else if (lowerCaseStackName.includes('phase-4') || lowerCaseStackName.includes('phase4')) {
      return 'phase-4';
    } else if (lowerCaseStackName.includes('phase-5') || lowerCaseStackName.includes('phase5')) {
      return 'phase-5';
    } else {
      return undefined;
    }
  }

  async getS3Prefix(stack: string, region: string): Promise<string> {
    const lowerCaseStackName = stack.toLowerCase();
    const migrationFilePrefix = 'migration';
    if (lowerCaseStackName.includes('network')) {
      return `${migrationFilePrefix}/network/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('operations')) {
      return `${migrationFilePrefix}/operations/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('management')) {
      return `${migrationFilePrefix}/management/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('security')) {
      return `${migrationFilePrefix}/security/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('perimeter')) {
      return `${migrationFilePrefix}/perimeter/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('logarchive')) {
      return `${migrationFilePrefix}/logarchive/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('stackset-awscontroltower')) {
      return `${migrationFilePrefix}/stackset-awscontroltower/${region}/${stack}`;
    } else {
      return `${migrationFilePrefix}/other/${region}/${stack}`;
    }
  }
}
