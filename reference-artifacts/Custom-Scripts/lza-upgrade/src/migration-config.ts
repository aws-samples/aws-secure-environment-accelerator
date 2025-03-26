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

import { Parameter } from '@aws-sdk/client-cloudformation';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { loadAseaConfig } from './asea-config/load';
import { DynamoDB } from './common/aws/dynamodb';
import { getAccountId, getAccountEmail } from './common/outputs/accounts';
import { loadAccounts } from './common/utils/accounts';
import { Config } from './config';
import * as migrationConfig from './preparation/migration-config';

export class MigrationConfig {
  private localUpdateOnly = false; // This is an option to not create mapping bucket stack and codecommit repositories, used only for development like yarn run migration-config local-update-only. Default is false

  constructor(localUpdateOnly?: boolean) {
    this.localUpdateOnly = localUpdateOnly ?? false;
  }

  async configure(): Promise<void> {
    const homeRegion = process.env.AWS_REGION ?? 'ca-central-1';
    const dynamoDb = new DynamoDB(undefined, homeRegion);
    const installerStack = await migrationConfig.getInstallerStackName(homeRegion);

    const stsClient = new STSClient({ region: 'us-east-1' });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    const currentAccountId = callerIdentity.Account ?? '';

    const acceleratorPrefix =
      installerStack?.parameters.find((p) => p.ParameterKey === 'AcceleratorPrefix')?.ParameterValue ?? 'PBBM-';
    const abbreviatedRegion = homeRegion.replaceAll('-', '');

    const mappingRepositoryName = `${acceleratorPrefix}Mappings`;
    const lzaConfigRepositoryName = `${acceleratorPrefix}LZA-config`;
    const mappingBucketName = `${acceleratorPrefix}LZA-Resource-Mapping-${currentAccountId}`.toLowerCase();
    const parametersTableName = `${acceleratorPrefix}Parameters`;
    const aseaConfigRepositoryName =
      installerStack?.parameters.find((p) => p.ParameterKey === 'ConfigRepositoryName')?.ParameterValue ??
      'PBBM-Config-Repo';

    const aseaConfig = await loadAseaConfig({
      filePath: 'raw/config.json',
      repositoryName: aseaConfigRepositoryName,
      defaultRegion: homeRegion,
    });

    const globalOptions = aseaConfig['global-options'];
    const managementAccount = globalOptions?.['aws-org-management'].account;
    const centralBucketName = await migrationConfig.getS3BucketName(
        `${acceleratorPrefix}${managementAccount}-phase0-config${abbreviatedRegion}`,
        homeRegion) ?? '';
    const accounts = await loadAccounts(parametersTableName, dynamoDb);
    const logArchiveAccountEmail = getAccountEmail(
      accounts,
      globalOptions?.['central-log-services'].account ?? 'log-archive',
    )!;
    const managementAccountEmail = getAccountEmail(
      accounts,
      globalOptions?.['aws-org-management'].account ?? 'management',
    )!;
    const auditAccountEmail = getAccountEmail(
      accounts,
      globalOptions?.['central-security-services'].account ?? 'security',
    )!;
    const operationsAccountId = getAccountId(
      accounts,
      globalOptions?.['central-operations-services'].account ?? 'operations',
    )!;
    const controlTowerEnabled = globalOptions?.['ct-baseline'] ?? false;
    let lzaControlTowerEnabled = 'No';
    if (controlTowerEnabled) {
      lzaControlTowerEnabled = 'Yes';
    }
    const lzaCodeRepositorySource = process.env.LZA_CODE_REPOSITORY_SOURCE ?? 'github';
    const lzaCodeRepositoryName = process.env.LZA_CODE_REPOSITORY_NAME ?? 'landing-zone-accelerator-on-aws';
    if (!process.env.CENTRAL_ASEA_BUCKET) {
      process.env.CENTRAL_ASEA_BUCKET = '';
    }
    let config: Config = {
      repositoryName: aseaConfigRepositoryName,
      parametersTableName: parametersTableName,
      homeRegion: homeRegion,
      assumeRoleName: `${acceleratorPrefix}PipelineRole`,
      aseaPrefix:
        this.getCfnParamValue(installerStack?.parameters, 'AcceleratorPrefix', 'ASEA-'),
      acceleratorName:
        this.getCfnParamValue(installerStack?.parameters, 'AcceleratorName', 'ASEA'),
      centralBucket: centralBucketName,
      operationsAccountId: operationsAccountId,
      installerStackName: installerStack?.stackName ?? 'ASEA-Installer',
      mappingBucketName: mappingBucketName,
      mappingRepositoryName: mappingRepositoryName,
      lzaConfigRepositoryName: lzaConfigRepositoryName,
      lzaCodeRepositorySource: lzaCodeRepositorySource,
      lzaCodeRepositoryOwner: 'awslabs',
      lzaCodeRepositoryName: lzaCodeRepositoryName,
      managementAccountEmail: managementAccountEmail,
      logArchiveAccountEmail: logArchiveAccountEmail,
      auditAccountEmail: auditAccountEmail,
      controlTowerEnabled: lzaControlTowerEnabled,
      aseaConfigBucketName:
        this.getCfnParamValue(installerStack?.parameters, 'ConfigS3Bucket', process.env.CENTRAL_ASEA_BUCKET),
    };
    const configString = JSON.stringify(config, null, '  ');
    console.log(configString);
    await migrationConfig.writeConfigFile(configString);

    //create CloudFormation stack for resource mapping bucket
    await migrationConfig.createS3CloudFormationStack(
      `${acceleratorPrefix}LZA-Resource-Mapping-Bucket`,
      config.mappingBucketName,
      homeRegion,
      this.localUpdateOnly,
    );

    //create codecommit repository for resource mapping
    const createMigrationRepositoryResponse = await migrationConfig.createRepository(
      mappingRepositoryName,
      'Repository for resource mappings. Do not delete.',
      homeRegion,
      this.localUpdateOnly,
    );
    console.log(`Created repository with id ${createMigrationRepositoryResponse}`);

    //create codecommit repository lza config
    const createLzaConfigRepositoryResponse = await migrationConfig.createRepository(
      lzaConfigRepositoryName,
      'LZA configuration repository',
      homeRegion,
      this.localUpdateOnly,
    );
    console.log(`Created repository with id ${createLzaConfigRepositoryResponse}`);
  }

  getCfnParamValue(parameters: Parameter[] | undefined, key: string, defaultValue: string = '' ) {
    if (!parameters) {
      return defaultValue;
    }
    return parameters.find((p) => p.ParameterKey === key)?.ParameterValue ?? defaultValue;
  }
}
