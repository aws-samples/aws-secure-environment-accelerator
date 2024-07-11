/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
/* eslint-disable @typescript-eslint/member-ordering */
import { CloudFormation } from 'aws-sdk';
import { loadAseaConfig } from './asea-config/load';
import aws from './common/aws/aws-client';
import { throttlingBackOff } from './common/aws/backoff';
import { DynamoDB } from './common/aws/dynamodb';
import { STS } from './common/aws/sts';
import { Account } from './common/outputs/accounts';
import { loadAccounts } from './common/utils/accounts';
import {
  ASEAResourceMapping,
  CfnClients,
  Environment,
  LogicalAndPhysicalResourceIds,
  NestedStack,
  StacksAndResourceMap,
} from './common/utils/types/resourceTypes';
import * as WriteToSourcesTypes from './common/utils/types/writeToSourcesTypes';
import { WriteToSources } from './common/utils/writeToSources';
import { Config } from './config';

export class ResourceMapping {
  private readonly s3: aws.S3;
  private readonly dynamodb: DynamoDB;
  private sts: STS;
  private readonly region: string;
  private readonly mappingBucketName: string;
  private readonly parametersTableName: string;
  private readonly configRepositoryName: string;
  private readonly assumeRoleName: string;
  private readonly mappingRepositoryName: string;
  private readonly outputsDirectory: string;
  private readonly writeToSources: WriteToSources;
  private driftedResources: any[] = [];
  writeConfig: any;
  skipDriftDetection: boolean | undefined;
  constructor(config: Config) {
    this.mappingBucketName = config.mappingBucketName;
    this.region = config.homeRegion;
    this.parametersTableName = config.parametersTableName;
    this.configRepositoryName = config.repositoryName;
    this.assumeRoleName = config.assumeRoleName ?? 'OrganizationAccountAccessRole';
    this.mappingRepositoryName = config.mappingRepositoryName;
    this.outputsDirectory = './outputs';
    this.skipDriftDetection = config.skipDriftDetection;
    this.dynamodb = new DynamoDB(undefined, this.region);
    this.sts = new STS();
    this.writeConfig = {
      localOnly: config.localOnlyWrites ?? false,
      region: config.homeRegion,
      localConfig: {
        baseDirectory: this.outputsDirectory,
      },
      s3Config: {
        bucket: this.mappingBucketName,
      },
      codeCommitConfig: {
        branch: 'main',
        repository: this.mappingRepositoryName,
      },
    };
    this.writeToSources = new WriteToSources(this.writeConfig);
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
    await this.validateS3Bucket(this.mappingBucketName);
    const enabledRegions = configFile['global-options']['supported-regions'];
    const accountList = await this.getAccountListFromDDB(this.parametersTableName);
    const environments = this.getEnvironments(accountList, enabledRegions);
    const cfnClients = await this.getCfnClientMap(environments);
    const environmentsStackMap = await this.getEnvironmentStacks(environments, cfnClients);
    const localAndS3Files: WriteToSourcesTypes.PutFiles[] = [];
    const environmentStackAndResourcesMap = await this.getEnvironmentMetaData(
      environments,
      environmentsStackMap,
      cfnClients,
    );
    const stackFiles = this.createStackFiles(environmentStackAndResourcesMap);
    const resourceFiles = this.createResourceFiles(environmentStackAndResourcesMap);
    if (!this.skipDriftDetection) {
      const driftFiles = await this.detectDrift(environmentStackAndResourcesMap, cfnClients);
      const driftDetectionCsv = this.convertToCSV(this.driftedResources);
      const driftDetectionPutFile: WriteToSourcesTypes.PutFiles = {
        fileContent: driftDetectionCsv,
        fileName: 'AllDriftDetectedResources.csv',
      };
      localAndS3Files.push(...driftFiles, driftDetectionPutFile);
    }
    const aseaMapping = this.createAseaMapping(environmentStackAndResourcesMap);
    const aseaMappingPutFile: WriteToSourcesTypes.PutFiles = {
      fileContent: JSON.stringify(aseaMapping, null, 2),
      fileName: 'mapping.json',
    };
    // get string length in megabytes
    const aseaMappingSize = JSON.stringify(aseaMapping, null, 2).length / (1024 * 1024);
    localAndS3Files.push(...stackFiles, ...resourceFiles);
    await this.writeToSources.writeFilesToS3(localAndS3Files, this.writeConfig.s3Config);
    await this.writeToSources.writeFilesToDisk(localAndS3Files, this.writeConfig.localConfig);
    if (aseaMappingSize > 5.5) {
      console.log('mapping.json approximate size is greater than 6MB, skipping write to codecommit.');
      await this.writeToSources.writeFilesToS3([aseaMappingPutFile], this.writeConfig.s3Config);
      await this.writeToSources.writeFilesToDisk([aseaMappingPutFile], this.writeConfig.localConfig);
    } else {
      await this.writeToSources.writeFiles([aseaMappingPutFile]);
    }
  }

  createStackKey(stackAndResources: StacksAndResourceMap) {
    return `${stackAndResources.environment.accountId}|${stackAndResources.environment.region}|${stackAndResources.stackName}`;
  }
  createAseaMapping(stackAndResourceMap: Map<string, StacksAndResourceMap>) {
    const aseaObj: ASEAResourceMapping = {};
    for (let [_key, stackAndResources] of stackAndResourceMap) {
      const aseaObjKey = this.createStackKey(stackAndResources);
      aseaObj[aseaObjKey] = {
        stackName: stackAndResources.stackName,
        region: stackAndResources.region,
        accountId: stackAndResources.environment.accountId,
        accountKey: stackAndResources.environment.accountKey,
        phase: stackAndResources.phase,
        countVerified: stackAndResources.countVerified,
        numberOfResources: stackAndResources.numberOfResources,
        numberOfResourcesInTemplate: stackAndResources.numberOfResourcesInTemplate,
        templatePath: `stacks/${stackAndResources.environment.accountId}/${stackAndResources.environment.region}/${stackAndResources.stackName}.json`,
        resourcePath: `resources/${stackAndResources.environment.accountId}/${stackAndResources.environment.region}/${stackAndResources.stackName}-resources.json`,
      };
      const nestedStacks = stackAndResources.nestedStacks;
      if (nestedStacks) {
        aseaObj[aseaObjKey].nestedStacks = Object.keys(nestedStacks).reduce(
          (acc: { [key: string]: NestedStack }, key) => {
            const nestedStack = nestedStacks[key];
            acc[key] = {
              logicalResourceId: nestedStack.logicalResourceId,
              stackName: nestedStack.stackName,
              region: nestedStack.region,
              accountId: nestedStack.accountId,
              accountKey: nestedStack.accountKey,
              phase: nestedStack.phase,
              countVerified: nestedStack.countVerified,
              numberOfResources: nestedStack.numberOfResources,
              numberOfResourcesInTemplate: nestedStack.numberOfResourcesInTemplate,
              templatePath: `stacks/${nestedStack.accountId}/${nestedStack.region}/${nestedStack.stackName}.json`,
              resourcePath: `resources/${nestedStack.accountId}/${nestedStack.region}/${nestedStack.stackName}-resources.json`,
            };
            return acc;
          },
          {},
        );
      }
    }
    return aseaObj;
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
    const stackListPromises = environments.map((environment) => {
      const cfnClient = cfnClientMap.get(`${environment.accountId}-${environment.region}`);
      if (!cfnClient) {
        throw new Error(
          `Could not retrieve cfn-client for account ${environment.accountId} and region ${environment.region}`,
        );
      }

      return this.getStackList(cfnClient.cfn, environment);
    });
    const stacks = await Promise.all(stackListPromises);
    stacks.forEach((stack) => stackMap.set(`${stack.environment.accountId}-${stack.environment.region}`, stack.stacks));

    return stackMap;
  }

  async getEnvironmentMetaData(
    environments: Environment[],
    stackMap: Map<string, string[]>,
    cfnClientMap: Map<string, CfnClients>,
  ) {
    const stackAndResourceMap = new Map<string, StacksAndResourceMap>();
    const environmentStacks = environments
      .map((environment) => {
        const cfnClient = cfnClientMap.get(`${environment.accountId}-${environment.region}`);
        const stacks = stackMap.get(`${environment.accountId}-${environment.region}`);
        return stacks?.map((stack) => {
          return { stack, cfnClient, environment };
        });
      })
      .flat();

    const stackAndResourcesMapPromises = environmentStacks.map((stack) => {
      if (!stack?.stack || !stack.cfnClient) {
        return undefined;
      }
      return this.getStackMetadata(stack.environment, stack.stack, stack.cfnClient.cfn, stack.cfnClient.cfnNative);
    });
    const validStackAndResourcePromises = stackAndResourcesMapPromises.filter(
      (stackAndResource): stackAndResource is Promise<StacksAndResourceMap> => stackAndResource !== undefined,
    );
    const stackAndResourcesList = await Promise.all(validStackAndResourcePromises);
    const allNestedStacks = stackAndResourcesList.filter((stackAndResource) =>
      stackAndResource.stackName.includes('Nested'),
    );
    stackAndResourcesList.forEach((stackAndResource) => {
      const nestedStacks = this.getNestedStacks(stackAndResource, allNestedStacks);
      if (nestedStacks) {
        stackAndResource.nestedStacks = nestedStacks;
      }
      const parentStack = this.getParentStack(stackAndResource);
      if (parentStack) {
        stackAndResource.parentStack = parentStack;
      }
      if (!stackAndResource.stackName.includes('Nested')) {
        stackAndResourceMap.set(
          `${stackAndResource.environment.accountId}-${stackAndResource.environment.region}-${stackAndResource.stackName}`,
          stackAndResource,
        );
      }
    });

    return stackAndResourceMap;
  }

  getParentStack(stackAndResource: StacksAndResourceMap) {
    if (stackAndResource.stackName.includes('NestedStack')) {
      const stackNameArr = stackAndResource.stackName.split('-');
      return `${stackAndResource.environment.accountId}|${stackAndResource.environment.region}|${stackNameArr[0]}-${stackNameArr[1]}-${stackNameArr[2]}`;
    }
    return undefined;
  }

  getNestedStacks(stackAndResource: StacksAndResourceMap, nestedStacks: StacksAndResourceMap[]) {
    const phaseIndex = stackAndResource.stackName.toLowerCase().indexOf('phase');
    // checks the length of the stack to determine if it is the nested stack or parent stack
    const isParentStack = phaseIndex + 6 === stackAndResource.stackName.length;
    if (!isParentStack) {
      return;
    }
    const matchedStacks = nestedStacks.filter(
      (nestedStackAndResource) =>
        stackAndResource.environment.accountId === nestedStackAndResource.environment.accountId &&
        stackAndResource.environment.region === nestedStackAndResource.environment.region &&
        nestedStackAndResource.stackName.includes(stackAndResource.stackName),
    );
    if (matchedStacks.length === 0) {
      return;
    }
    return matchedStacks.reduce((nestedStacksObj: { [key: string]: NestedStack }, matchedStackAndResources) => {
      const nestedStackLogicalId = stackAndResource.resourceMap.find((resource) =>
        resource.physicalResourceId.includes(matchedStackAndResources.stackName),
      );
      const stackKey = this.createStackKey(matchedStackAndResources);
      nestedStacksObj[stackKey] = {
        logicalResourceId: nestedStackLogicalId?.logicalResourceId ?? '',
        stackName: matchedStackAndResources.stackName,
        region: matchedStackAndResources.region,
        accountId: matchedStackAndResources.environment.accountId,
        accountKey: matchedStackAndResources.environment.accountKey,
        phase: matchedStackAndResources.phase,
        countVerified: matchedStackAndResources.countVerified,
        numberOfResources: matchedStackAndResources.numberOfResources,
        numberOfResourcesInTemplate: matchedStackAndResources.numberOfResourcesInTemplate,
        template: matchedStackAndResources.template,
        resourceMap: matchedStackAndResources.resourceMap,
        templatePath: `stacks/${matchedStackAndResources.environment.accountId}/${matchedStackAndResources.environment.region}/${matchedStackAndResources.stackName}.json`,
        resourcePath: `resources/${matchedStackAndResources.environment.accountId}/${matchedStackAndResources.environment.region}/${matchedStackAndResources.stackName}-resources.json`,
      };
      return nestedStacksObj;
    }, {});
  }

  createResourceFiles(stackAndResourceMap: Map<string, StacksAndResourceMap>): WriteToSourcesTypes.PutFiles[] {
    const putFiles: WriteToSourcesTypes.PutFiles[] = [];
    stackAndResourceMap.forEach((stackAndResource) => {
      putFiles.push({
        filePath: `resources/${stackAndResource.environment.accountId}/${stackAndResource.environment.region}`,
        fileName: `${stackAndResource.stackName}-resources.json`,
        fileContent: JSON.stringify(stackAndResource.resourceMap, null, 4),
      });
      if (stackAndResource.nestedStacks) {
        for (const nestedStack of Object.values(stackAndResource.nestedStacks)) {
          putFiles.push({
            filePath: `resources/${nestedStack.accountId}/${nestedStack.region}`,
            fileName: `${nestedStack.stackName}-resources.json`,
            fileContent: JSON.stringify(nestedStack.resourceMap, null, 4),
          });
        }
      }
    });
    return putFiles;
  }

  createStackFiles(stackAndResourceMap: Map<string, StacksAndResourceMap>): WriteToSourcesTypes.PutFiles[] {
    const putFiles: WriteToSourcesTypes.PutFiles[] = [];
    stackAndResourceMap.forEach((stackAndResource) => {
      putFiles.push({
        filePath: `stacks/${stackAndResource.environment.accountId}/${stackAndResource.environment.region}`,
        fileName: `${stackAndResource.stackName}.json`,
        fileContent: JSON.stringify(stackAndResource.template, null, 2),
      });
      if (stackAndResource.nestedStacks) {
        for (const nestedStack of Object.values(stackAndResource.nestedStacks)) {
          putFiles.push({
            filePath: `stacks/${nestedStack.accountId}/${nestedStack.region}`,
            fileName: `${nestedStack.stackName}.json`,
            fileContent: JSON.stringify(nestedStack.template, null, 2),
          });
        }
      }
    });
    return putFiles;
  }

  async detectDrift(
    stackAndResourceMap: Map<string, StacksAndResourceMap>,
    cfnClientMap: Map<string, CfnClients>,
  ): Promise<WriteToSourcesTypes.PutFiles[]> {
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
    const detectDriftResults = await Promise.all(detectDriftPromises);
    return detectDriftResults.flat();
  }

  async getEnvironmentDrift(
    stackAndResourceMap: StacksAndResourceMap,
    cfnClients: CfnClients,
  ): Promise<WriteToSourcesTypes.PutFiles[]> {
    const driftDetectionResources = await this.getStackDrift(
      cfnClients.cfnNative,
      stackAndResourceMap.stackName,
      stackAndResourceMap.resourceMap,
    );
    const s3Prefix = await this.getFilePrefix(stackAndResourceMap.stackName, stackAndResourceMap.region);
    const driftDetectionCsv = this.convertToCSV(driftDetectionResources);
    const driftDetectionFileName = `${stackAndResourceMap.stackName}-drift-detection.csv`;
    const driftDetectionFilePath = s3Prefix;
    const resourceFileName = `${stackAndResourceMap.stackName}-resources.csv`;
    const resourceFilePath = s3Prefix;
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
    return [
      { fileName: driftDetectionFileName, filePath: driftDetectionFilePath, fileContent: driftDetectionCsv },
      { fileName: resourceFileName, filePath: resourceFilePath, fileContent: resourceFileCSV },
    ];
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
      stackName: stack,
      region: environment.region,
      phase: phase,
      countVerified: countVerified,
      numberOfResources: stackResources.length,
      numberOfResourcesInTemplate: cfTemplateResourceCount,
      resourceMap: stackResources,
      template: cfTemplateObject,
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

  async getStackList(cloudformation: CloudFormation, environment: Environment) {
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
    return {
      stacks,
      environment,
    };
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
      return '-1';
    } else if (lowerCaseStackName.includes('phase-0') || lowerCaseStackName.includes('phase0')) {
      return '0';
    } else if (lowerCaseStackName.includes('phase1')) {
      return '1';
    } else if (lowerCaseStackName.includes('phase-2') || lowerCaseStackName.includes('phase2')) {
      return '2';
    } else if (lowerCaseStackName.includes('phase-3') || lowerCaseStackName.includes('phase3')) {
      return '3';
    } else if (lowerCaseStackName.includes('phase-4') || lowerCaseStackName.includes('phase4')) {
      return '4';
    } else if (lowerCaseStackName.includes('phase-5') || lowerCaseStackName.includes('phase5')) {
      return '5';
    } else {
      return undefined;
    }
  }

  async getFilePrefix(stack: string, region: string): Promise<string> {
    const lowerCaseStackName = stack.toLowerCase();
    const driftFilePrefix = 'drift-detection';
    if (lowerCaseStackName.includes('network')) {
      return `${driftFilePrefix}/network/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('operations')) {
      return `${driftFilePrefix}/operations/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('management')) {
      return `${driftFilePrefix}/management/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('security')) {
      return `${driftFilePrefix}/security/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('perimeter')) {
      return `${driftFilePrefix}/perimeter/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('logarchive')) {
      return `${driftFilePrefix}/logarchive/${region}/${stack}`;
    } else if (lowerCaseStackName.includes('stackset-awscontroltower')) {
      return `${driftFilePrefix}/stackset-awscontroltower/${region}/${stack}`;
    } else {
      return `${driftFilePrefix}/other/${region}/${stack}`;
    }
  }
}
