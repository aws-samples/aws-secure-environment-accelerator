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

export class Preparation {
  private readonly aseaPrefix: string;
  private readonly homeRegion: string;
  private readonly operationsAccountId: string;
  private readonly globalRegion: string = 'us-east-1';
  private readonly installerStackName: string;

  constructor(config: Config) {
    this.aseaPrefix = config.aseaPrefix ?? 'ASEA';
    this.homeRegion = config.homeRegion ?? 'ca-central-1';
    this.operationsAccountId = config.operationsAccountId ?? '';
    this.installerStackName = config.installerStackName ?? 'ASEA-Installer';
  }

  async prepareAsea() {
    const stsClient = new STSClient({ region: 'us-east-1' });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    const accountId = callerIdentity.Account ?? '';
    await aseaPrep.updateSecretsKey(this.aseaPrefix, this.operationsAccountId);
    await aseaPrep.deleteEcrImages(accountId, this.homeRegion);
    await aseaPrep.deleteCloudformationStack(`${this.aseaPrefix}-CDKToolkit`, this.homeRegion);
    await aseaPrep.deleteCloudformationStack(`${this.aseaPrefix}-CDKToolkit`, this.globalRegion);
    await aseaPrep.deleteCloudformationStack(this.installerStackName, this.homeRegion);
    await aseaPrep.deleteCloudformationStack(`${this.aseaPrefix}-InitialSetup`, this.homeRegion);
    await aseaPrep.setSSMMigrationParameter(this.homeRegion);
  }
}
