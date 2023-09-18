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
import { AcceleratorConfig, ImportCertificateConfig, ImportCertificateConfigType } from './asea-config';
import { loadAseaConfig } from './asea-config/load';
import { DynamoDB } from './common/aws/dynamodb';
import { S3 } from './common/aws/s3';
import { Account, getAccountId } from './common/outputs/accounts';
import { StackOutput, findValuesFromOutputs, loadOutputs } from './common/outputs/load-outputs';
import { loadAccounts } from './common/utils/accounts';
import { PostMigrationCommandConfig } from './config';

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
  constructor(config: PostMigrationCommandConfig) {
    this.aseaConfigRepositoryName = config.repositoryName;
    this.region = config.homeRegion;
    this.aseaPrefix = config.aseaPrefix!.endsWith('-') ? config.aseaPrefix! : `${config.aseaPrefix}-`;
    this.s3 = new S3(undefined, this.region);
    this.dynamoDb = new DynamoDB(undefined, this.region);
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
    await this.copyCertificateAssets(aseaConfig);
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
}
