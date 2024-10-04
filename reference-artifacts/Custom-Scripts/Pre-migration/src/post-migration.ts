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
import * as fs from 'fs';
import path from 'path';
import { AcceleratorConfig, ImportCertificateConfig, ImportCertificateConfigType } from './asea-config';
import { loadAseaConfig } from './asea-config/load';
import { DynamoDB } from './common/aws/dynamodb';
import { S3 } from './common/aws/s3';
import { Account, getAccountId } from './common/outputs/accounts';
import { StackOutput, findValuesFromOutputs, loadOutputs } from './common/outputs/load-outputs';
import { loadAccounts } from './common/utils/accounts';
import { ASEAMapping, ASEAResourceMapping } from './common/utils/types/resourceTypes';
import { PutFiles } from './common/utils/types/writeToSourcesTypes';
import { WriteToSources } from './common/utils/writeToSources';
import { Config } from './config';

export class PostMigration {
  private readonly aseaConfigRepositoryName: string;
  private readonly region: string;
  private readonly aseaPrefix: string;
  private readonly s3: S3;
  private readonly dynamoDb: DynamoDB;
  private outputs: StackOutput[] = [];
  private accounts: Account[] = [];
  private centralBucket: string | undefined;
  private lzaAssetsBucket: string | undefined;
  private args: string[];
  outputsDirectory: string;
  writeConfig: any;
  mappingBucketName: string;
  mappingRepositoryName: string;
  writeToSources: WriteToSources;
  constructor(config: Config, args: string[]) {
    this.aseaConfigRepositoryName = config.repositoryName;
    this.region = config.homeRegion;
    this.aseaPrefix = config.aseaPrefix!.endsWith('-') ? config.aseaPrefix! : `${config.aseaPrefix}-`;
    this.mappingBucketName = config.mappingBucketName;
    this.mappingRepositoryName = config.mappingRepositoryName;
    this.s3 = new S3(undefined, this.region);
    this.dynamoDb = new DynamoDB(undefined, this.region);
    this.args = args;
    this.outputsDirectory = './outputs';
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
  }

  async process() {
    const aseaConfig = await loadAseaConfig({
      filePath: 'raw/config.json',
      repositoryName: this.aseaConfigRepositoryName,
      defaultRegion: this.region,
    });
    this.outputs = await loadOutputs(`${this.aseaPrefix}Outputs`, this.dynamoDb);
    this.accounts = await loadAccounts(`${this.aseaPrefix}Parameters`, this.dynamoDb);
    const centralBucketOutput = findValuesFromOutputs({
      outputs: this.outputs,
      accountKey: aseaConfig['global-options']['aws-org-management'].account,
      region: this.region,
      predicate: (o) => o.type === 'CentralBucket',
    })?.[0];
    this.centralBucket = centralBucketOutput.value.bucketName as string;
    const managementAccountId = getAccountId(
      this.accounts,
      aseaConfig['global-options']['aws-org-management'].account,
    )!;
    this.lzaAssetsBucket = `${this.aseaPrefix.toLowerCase()}assets-${managementAccountId}-${this.region}`;
    const resourceMappingString = await this.s3.getObjectBodyAsString({
      Bucket: this.mappingBucketName,
      Key: 'mapping.json',
    });
    const resourceMapping = JSON.parse(resourceMappingString);
    const mappingConfig = {
      mappings: resourceMapping,
      mappingBucket: this.mappingBucketName,
      s3Client: this.s3,
    };
    await this.loadMappingResourceFiles(resourceMapping, this.mappingBucketName, this.s3);

    for (const arg of this.args) {
      switch (arg) {
        case 'remove-stack-outputs':
          await this.removeOutputs(resourceMapping, this.s3, this.mappingBucketName);
          break;
        case 'copy-certificates':
          await this.copyCertificateAssets(aseaConfig);
          break;
        case 'remove-sns-resources':
          await this.removeSnsResources(mappingConfig);
          break;
        case 'remove-asea-config-rules':
          await this.removeConfigRules(mappingConfig);
          break;
        case 'remove-rsyslog':
          await this.markDuplicateResourcesForRemoval({
            mappingConfig,
            phase: '3',
            partialLogicalId: 'rsyslog',
          });
          break;
        case 'remove-cloudwatch-alarms':
          await this.markDuplicateResourcesForRemoval({
            mappingConfig,
            phase: '5',
            resourceType: 'AWS::CloudWatch::Alarm',
          });
          break;
        case 'remove-cloudwatch-metrics':
          await this.markDuplicateResourcesForRemoval({
            mappingConfig,
            phase: '4',
            resourceType: 'Custom::LogsMetricFilter',
          });
          break;
        case 'remove-budgets':
          await this.markDuplicateResourcesForRemoval({
            mappingConfig,
            phase: '0',
            resourceType: 'AWS::Budgets::Budget',
          });
          await this.markDuplicateResourcesForRemoval({
            mappingConfig,
            phase: '1',
            resourceType: 'AWS::Budgets::Budget',
          });
          break;
        case 'remove-logging':
          await this.removeLogging(mappingConfig);
      }
    }

    await this.writeResourceFilesTos3(resourceMapping, this.mappingBucketName);
  }

  /**
   * Copy certificate assets from ASEA Central Bucket to LZA Assets bucket if not already not exists
   * @param aseaConfig
   */
  private async copyCertificateAssets(aseaConfig: AcceleratorConfig) {
    // Set to maintain list of asset paths addressed to avoid making headObject requests for same object.
    const assets = new Set<string>();
    const importCertificates: ImportCertificateConfig[] = aseaConfig
      .getCertificatesConfig()
      .filter((certificate) => ImportCertificateConfigType.is(certificate)) as ImportCertificateConfig[];
    for (const certificate of importCertificates) {
      if (
        assets.has(certificate['priv-key']) ||
        !(await this.s3.objectExists({ Bucket: this.centralBucket!, Key: certificate['priv-key'] })) ||
        (await this.s3.objectExists({ Bucket: this.lzaAssetsBucket!, Key: certificate['priv-key'] }))
      ) {
        console.log(`Asset "${certificate['priv-key']}" is already copied to assets bucket.`);
      } else {
        await this.s3.copyObject(this.centralBucket!, certificate['priv-key'], this.lzaAssetsBucket!);
      }
      if (
        assets.has(certificate.cert) ||
        !(await this.s3.objectExists({ Bucket: this.centralBucket!, Key: certificate.cert })) ||
        (await this.s3.objectExists({ Bucket: this.lzaAssetsBucket!, Key: certificate.cert }))
      ) {
        console.log(`Asset "${certificate.cert}" is already copied to assets bucket.`);
      } else {
        await this.s3.copyObject(this.centralBucket!, certificate.cert, this.lzaAssetsBucket!);
      }
      assets.add(certificate['priv-key']).add(certificate.cert);
    }
  }

  private async removeOutputs(resourceMapping: { [key: string]: ASEAMapping }, s3Client: S3, mappingBucket: string) {
    const removeOutputsPromises = Object.keys(resourceMapping).map((key) =>
      this.removeStackOutput(resourceMapping[key], s3Client, mappingBucket),
    );
    await Promise.all(removeOutputsPromises);
  }

  private async removeStackOutput(mapping: ASEAMapping, s3Client: S3, mappingBucket: string) {
    const stackString = await s3Client.getObjectBodyAsString({ Bucket: mappingBucket, Key: mapping.templatePath });
    let stack = JSON.parse(stackString);
    if (stack.Outputs) {
      delete stack.Outputs;
    }
    const nestedStacks = mapping.nestedStacks;
    if (nestedStacks) {
      for (const [, nestedStack] of Object.entries(nestedStacks)) {
        const nestedTemplateString = await s3Client.getObjectBodyAsString({
          Bucket: mappingBucket,
          Key: nestedStack.templatePath,
        });
        try {
          const nestedTemplate = JSON.parse(nestedTemplateString);
          const newNestedTemplate = this.removeNestedStackOutputs(nestedTemplate);
          await s3Client.putObject({
            Bucket: mappingBucket,
            Key: nestedStack.templatePath,
            Body: JSON.stringify(newNestedTemplate, null, 2),
            ServerSideEncryption: 'AES256',
          });
        } catch (err) {
          console.log(`Error processing nested stack ${nestedStack.templatePath}`);
          throw err;
        }
      }
    }
    await s3Client.putObject({
      Bucket: mappingBucket,
      Key: mapping.templatePath,
      Body: JSON.stringify(stack, null, 2),
      ServerSideEncryption: 'AES256',
    });
  }

  private removeNestedStackOutputs(stack: any) {
    if (stack.Outputs) {
      Object.keys(stack.Outputs).forEach((output) => {
        console.log(`Checking output ${output}`);
        if (!output.includes('Phase1VpcStack')) {
          console.log(`Removing output ${output}`);
          delete stack.Outputs[output];
        }
      });
    }
    return stack;
  }

  private async addDeletionFlagByResourceType(props: {
    mapping: ASEAMapping;
    resourceType: string;
    isRetained?: boolean;
  }) {
    const resourcesString = (await fs.promises.readFile(path.join('outputs', props.mapping.resourcePath))).toString();
    const resources = JSON.parse(resourcesString);
    const resourceTypeExistsInStack = resources.find((resource: any) => resource.resourceType === props.resourceType);
    if (!resourceTypeExistsInStack) {
      return;
    }
    for (const resource of resources) {
      if (resource.resourceType === props.resourceType) {
        console.log(resource.logicalResourceId);
        resource.isDeleted = 'true';
        if (props.isRetained) {
          resource.resourceMetadata.DeletionPolicy = 'Retain';
        }
        console.log(
          `Adding deletion flag for ${resource.logicalResourceId} in ${props.mapping.accountId}|${props.mapping.region}|${props.mapping.stackName}`,
        );
      }
    }
    await fs.promises.writeFile(path.join('outputs', props.mapping.resourcePath), JSON.stringify(resources, null, 2));
  }

  private async addDeletionFlagByPartialMatch(props: {
    mapping: ASEAMapping;
    mappingBucket: string;
    partialLogicalId: string;
    isRetained?: boolean;
  }) {
    const resourcesString = (await fs.promises.readFile(path.join('outputs', props.mapping.resourcePath))).toString();
    const resources: any[] = JSON.parse(resourcesString);
    const partialMatchResources = resources.filter((resource: any) =>
      resource.logicalResourceId.toLowerCase().includes(props.partialLogicalId.toLowerCase()),
    );
    if (partialMatchResources.length === 0) {
      return;
    }
    for (const resource of resources) {
      if (
        partialMatchResources.find((matchResource) => matchResource.logicalResourceId === resource.logicalResourceId)
      ) {
        resource.isDeleted = 'true';
        console.log(
          `Adding deletion flag for ${resource.logicalResourceId} in resource mapping ${props.mapping.accountId}|${props.mapping.region}|${props.mapping.stackName}`,
        );
      }
    }
    await fs.promises.writeFile(path.join('outputs', props.mapping.resourcePath), JSON.stringify(resources, null, 2));
  }

  private async markDuplicateResourcesForRemoval(props: {
    mappingConfig: {
      mappings: ASEAResourceMapping;
      mappingBucket: string;
    };
    resourceType?: string;
    partialLogicalId?: string;
    phase: string;
  }) {
    if (props.partialLogicalId && props.resourceType) {
      throw new Error('Cannot specify both partialLogicalId and resourceType');
    }
    const phaseMappingKeys = Object.keys(props.mappingConfig.mappings).filter((key) =>
      props.mappingConfig.mappings[key].stackName.includes(`Phase${props.phase}`),
    );
    const phaseMappings = phaseMappingKeys.map((key) => props.mappingConfig.mappings[key]);
    const resourceRemovalPromises = [];
    for (const mapping of phaseMappings) {
      if (props.resourceType) {
        resourceRemovalPromises.push(
          this.addDeletionFlagByResourceType({
            mapping,
            resourceType: props.resourceType,
            isRetained: false,
          }),
        );
      }
      if (props.partialLogicalId) {
        resourceRemovalPromises.push(
          this.addDeletionFlagByPartialMatch({
            mapping,
            mappingBucket: props.mappingConfig.mappingBucket,
            partialLogicalId: props.partialLogicalId,
            isRetained: false,
          }),
        );
      }
    }
    await Promise.all(resourceRemovalPromises);
  }
  private async removeSnsResources(mappingConfig: {
    mappings: ASEAResourceMapping;
    mappingBucket: string;
    s3Client: S3;
  }) {
    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '2',
      resourceType: 'AWS::SNS::Topic',
    });

    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '2',
      resourceType: 'AWS::SNS::Subscription',
    });

    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '2',
      resourceType: 'AWS::SNS::TopicPolicy',
    });
  }

  private async removeConfigRules(mappingConfig: {
    mappings: ASEAResourceMapping;
    mappingBucket: string;
    s3Client: S3;
  }) {
    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '3',
      resourceType: 'AWS::Config::ConfigRule',
    });
    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '3',
      resourceType: 'AWS::Config::RemediationConfiguration',
    });
  }

  private async removeLogging(mappingConfig: { mappings: ASEAResourceMapping; mappingBucket: string; s3Client: S3 }) {
    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '1',
      resourceType: 'AWS::KinesisFirehose::DeliveryStream',
    });

    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '1',
      resourceType: 'AWS::Logs::Destination',
    });

    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '1',
      resourceType: 'AWS::Kinesis::Stream',
    });

    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '1',
      partialLogicalId: 'FirehosePrefixProcessingLambda',
    });
    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '1',
      partialLogicalId: 'KinesisStreamRoleLookup',
    });
    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '5',
      partialLogicalId: 'AddSubscriptionFilter',
    });
    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '5',
      partialLogicalId: 'CentralLoggingSubscriptionFilter',
    });

    await this.markDuplicateResourcesForRemoval({
      mappingConfig,
      phase: '2',
      resourceType: 'AWS::EC2::FlowLog',
    });
  }

  async loadMappingResourceFiles(
    resourceMapping: { [key: string]: ASEAMapping },
    mappingBucketName: string,
    s3Client: S3,
  ) {
    const resourceFilePromises = Object.entries(resourceMapping)
      .map(([_key, entry]) => {
        const filePromises = [];
        filePromises.push(this.loadResourceMappingFile(entry.resourcePath, mappingBucketName, s3Client));
        if (entry.nestedStacks) {
          for (const [, nestedStackEntry] of Object.entries(entry.nestedStacks)) {
            filePromises.push(this.loadResourceMappingFile(nestedStackEntry.resourcePath, mappingBucketName, s3Client));
          }
        }
        return filePromises;
      })
      .flat();
    const resourceFiles = await Promise.all(resourceFilePromises);
    await this.writeToSources.writeFilesToDisk(resourceFiles);
  }

  async loadResourceMappingFile(resourceFilePath: string, mappingBucketName: string, s3Client: S3): Promise<PutFiles> {
    const resourceMappingString = await s3Client.getObjectBodyAsString({
      Bucket: mappingBucketName,
      Key: resourceFilePath,
    });
    const filePathArr = resourceFilePath.split('/');
    const fileName = filePathArr.pop();
    if (!fileName) {
      throw new Error(`Could not get file name for ${resourceFilePath}`);
    }
    const filePath = filePathArr.join('/');
    return {
      fileContent: resourceMappingString,
      filePath,
      fileName,
    };
  }

  async writeResourceFilesTos3(resourceMapping: { [key: string]: ASEAMapping }, mappingBucketName: string) {
    const resourceFiles = Object.entries(resourceMapping)
      .map(([_key, entry]) => {
        const putFilePromises: PutFiles[] = [];
        const filePathArr = entry.resourcePath.split('/');
        const fileName = filePathArr.pop();
        const filePath = filePathArr.join('/');
        if (!fileName) {
          throw new Error(`Could not get file name for ${entry.resourcePath}`);
        }
        const fileContent = fs.readFileSync(path.join('outputs', entry.resourcePath), 'utf-8').toString();
        putFilePromises.push({
          fileContent,
          filePath,
          fileName,
        });
        if (entry.nestedStacks) {
          for (const [, nestedEntry] of Object.entries(entry.nestedStacks)) {
            const nestedFilePathArr = nestedEntry.resourcePath.split('/');
            const nestedFileName = nestedFilePathArr.pop();
            const nestedFilePath = nestedFilePathArr.join('/');
            if (!nestedFileName) {
              throw new Error(`Could not get file name for ${nestedEntry.resourcePath}`);
            }
            const nestedFileContent = fs
              .readFileSync(path.join('outputs', nestedEntry.resourcePath), 'utf-8')
              .toString();
            putFilePromises.push({
              fileContent: nestedFileContent,
              filePath: nestedFilePath,
              fileName: nestedFileName,
            });
          }
        }
        return putFilePromises;
      })
      .flat();

    await this.writeToSources.writeFilesToS3(resourceFiles, { bucket: mappingBucketName });
  }
}
