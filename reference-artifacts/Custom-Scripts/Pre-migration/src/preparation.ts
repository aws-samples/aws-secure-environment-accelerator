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

import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

import { Config } from './config';
import * as aseaPrep from './preparation/asea';
import {
  getLZAInstallerStackTemplate,
  InstallerStackParameters,
  createLZAInstallerCloudFormationStack,
  putLZAInstallerStackTemplate,
} from './preparation/aws-lza';

export class Preparation {
  private readonly aseaPrefix: string;
  private readonly homeRegion: string;
  private readonly operationsAccountId: string;
  private readonly globalRegion: string = 'us-east-1';
  private readonly installerStackName: string;
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
    this.aseaPrefix = config.aseaPrefix ?? 'ASEA-';
    this.homeRegion = config.homeRegion ?? 'ca-central-1';
    this.operationsAccountId = config.operationsAccountId ?? '';
    this.installerStackName = config.installerStackName ?? 'ASEA-Installer';
  }

  async prepareAsea() {
    const stsClient = new STSClient({ region: 'us-east-1' });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    const accountId = callerIdentity.Account ?? '';
    await aseaPrep.updateSecretsKey(this.aseaPrefix.replaceAll('-', ''), this.operationsAccountId, this.homeRegion);
    await aseaPrep.deleteEcrImages(accountId, this.homeRegion);
    await aseaPrep.backupCloudformationStack(this.installerStackName, this.homeRegion);
    await aseaPrep.deleteCloudformationStack(this.installerStackName, this.homeRegion);
    await aseaPrep.deleteCloudformationStack(`${this.aseaPrefix}InitialSetup`, this.homeRegion);
    await aseaPrep.deleteCloudformationStack(`${this.aseaPrefix}CDKToolkit`, this.homeRegion);
    await aseaPrep.deleteCloudformationStack(`${this.aseaPrefix}CDKToolkit`, this.globalRegion);
    await aseaPrep.setSSMMigrationParameter(this.homeRegion);
    await aseaPrep.disableASEARules(this.aseaPrefix.replaceAll('-', ''));
    await aseaPrep.updateSecretsKey(this.aseaPrefix.replaceAll('-', ''), this.operationsAccountId, this.homeRegion);
  }

  async prepareLza() {
    await getLZAInstallerStackTemplate('solutions-reference', '../../outputs');
    await putLZAInstallerStackTemplate(this.config.aseaConfigBucketName, '../../outputs', this.homeRegion);
    const installerStackParameters: InstallerStackParameters = {
      repositorySource: this.config.lzaCodeRepositorySource ?? 'github',
      repositoryOwner: this.config.lzaCodeRepositoryOwner ?? 'awslabs',
      repositoryName: this.config.lzaCodeRepositoryName ?? 'landing-zone-accelerator-on-aws',
      repositoryBranchName: this.config.lzaCodeRepositoryBranch ?? 'asea-lza-migration',
      enableApprovalStage: 'No',
      approvalStageNotifyEmailList: '',
      managementAccountEmail: this.config.managementAccountEmail ?? '',
      logArchiveAccountEmail: this.config.logArchiveAccountEmail ?? '',
      auditAccountEmail: this.config.auditAccountEmail ?? '',
      controlTowerEnabled: this.config.controlTowerEnabled ?? 'No',
      acceleratorPrefix: this.config.aseaPrefix?.replaceAll('-', '') ?? 'ASEA',
      useExistingConfigRepo: 'Yes',
      existingConfigRepositoryName: this.config.lzaConfigRepositoryName ?? 'ASEA-LZA-config',
      existingConfigRepositoryBranchName: 'main',
    };
    await createLZAInstallerCloudFormationStack(
      `${this.aseaPrefix}LZA-Installer`,
      installerStackParameters,
      //'../../outputs',
      `https://${this.config.aseaConfigBucketName}.s3.amazonaws.com/AWSAccelerator-InstallerStack.template`,
      this.homeRegion,
    );
  }
}
