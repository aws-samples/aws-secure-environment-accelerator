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
import * as fs from 'fs/promises';
import path from 'path';
import { CodeCommitClient, CreateCommitCommand, GetBranchCommand, NoChangeException } from '@aws-sdk/client-codecommit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { throttlingBackOff } from '../aws/backoff';
import * as convert from './conversion';
import * as writeSourceTypes from './types/writeToSourcesTypes';

export class WriteToSources {
  private localOnly: boolean = false;
  private readonly codecommit: CodeCommitClient;
  private readonly s3: S3Client;
  private readonly config: writeSourceTypes.WriteToSourcesConfig;

  constructor(props: writeSourceTypes.WriteToSourcesConfig) {
    this.localOnly = !!props.localOnly;
    this.config = props;
    this.s3 = new S3Client({ region: props.region });
    this.codecommit = new CodeCommitClient({ region: props.region });
  }

  public async writeFiles(
    putFiles: writeSourceTypes.PutFiles[],
    configOverride?: writeSourceTypes.WriteToSourcesConfig,
  ) {
    const config = configOverride ?? this.config;
    const writeFilePromises = [];
    if (config.codeCommitConfig) {
      writeFilePromises.push(this.writeFilesToCodeCommit(putFiles, config.codeCommitConfig));
    }
    if (config.s3Config) {
      writeFilePromises.push(this.writeFilesToS3(putFiles, config.s3Config));
    }
    writeFilePromises.push(this.writeFilesToDisk(putFiles, config.localConfig));
    await Promise.all(writeFilePromises);
  }

  public async writeFilesToCodeCommit(
    putFiles: writeSourceTypes.PutFiles[],
    config: writeSourceTypes.CodeCommitWriteConfig,
  ): Promise<void> {
    if (this.localOnly) {
      console.info('Ignoring write to CodeCodecommit because local-update-only was set.');
      return;
    }
    for (const file of putFiles) {
      const filePath = this.setFilePath({ baseDirectory: config.baseDirectory, path: file.filePath });
      console.log('FILEPATH: ', filePath || './');
      await this.writeToCodeCommit({
        fileContent: file.fileContent,
        filePath,
        fileName: file.fileName,
        repository: config.repository,
        branch: config.branch,
      });
    }
  }

  public async writeToCodeCommit(props: writeSourceTypes.WriteToCodeCommit) {
    if (this.localOnly) {
      console.warn('Ignoring write to codeCodecommit because local-update-only was set.');
      return;
    }

    let filePath = props.fileName;
    if (props.filePath) {
      filePath = path.join(props.filePath, props.fileName);
    }
    try {
      let fileContent = props.fileContent;
      if (typeof filePath === 'string') {
        fileContent = convert.encodeBase64(props.fileContent);
      }
      const getBranchCommand = await throttlingBackOff(() =>
        this.codecommit.send(new GetBranchCommand({ repositoryName: props.repository, branchName: props.branch })),
      );
      console.debug(`Writing file to repository ${props.repository}/${props.branch}/${filePath}`);
      await throttlingBackOff(() =>
        this.codecommit.send(
          new CreateCommitCommand({
            repositoryName: props.repository,
            parentCommitId: getBranchCommand.branch!.commitId,
            branchName: 'main',
            putFiles: [
              {
                filePath,
                fileContent: fileContent as unknown as Uint8Array,
              },
            ],
          }),
        ),
      );
      console.debug(`Wrote file to repository ${props.repository}/${props.branch}/${filePath}`);
    } catch (error: any) {
      if (error instanceof NoChangeException) {
        console.debug('No changes to commit: ', props.filePath);
        return;
      }
      console.error(`Failed to write file to repository ${props.repository}/${props.branch}/${filePath}`);
      throw error;
    }
  }

  public async writeFilesToS3(
    putFiles: writeSourceTypes.PutFiles[],
    config: writeSourceTypes.S3WriteConfig,
  ): Promise<void> {
    if (this.localOnly) {
      console.info('Ignoring write to S3 because local-update-only was set.');
      return;
    }
    const s3putObjectPromises = [];
    for (const file of putFiles) {
      const filePath = this.setFilePath({ baseDirectory: config.baseDirectory, path: file.filePath });
      s3putObjectPromises.push(
        this.writeToS3({
          fileContent: file.fileContent,
          filePath,
          fileName: file.fileName,
          bucket: config.bucket,
        }),
      );
    }
    await Promise.all(s3putObjectPromises);
  }

  public async writeToS3(props: writeSourceTypes.WriteToS3Config) {
    if (this.localOnly) {
      console.warn('Ignoring write to S3 because local-update-only was set.');
      return;
    }
    let filePath = props.fileName;
    if (props.filePath) {
      filePath = path.join(props.filePath, props.fileName);
    }
    console.debug(`Writing file to path ${props.bucket}/${filePath}`);
    await throttlingBackOff(() =>
      this.s3.send(
        new PutObjectCommand({
          Bucket: props.bucket,
          Key: filePath,
          Body: props.fileContent,
          ServerSideEncryption: 'AES256',
        }),
      ),
    );
    console.debug(`Wrote file to S3 ${props.bucket}/${filePath}`);
  }
  public async writeFilesToDisk(
    putFiles: writeSourceTypes.PutFiles[],
    localConfig?: writeSourceTypes.LocalWriteConfig,
  ) {
    const config = localConfig ?? this.config.localConfig;
    const writeFilePromises = [];
    for (const file of putFiles) {
      const filePath = this.setFilePath({ baseDirectory: config.baseDirectory, path: file.filePath });
      writeFilePromises.push(
        this.writeToDisk({
          fileContent: file.fileContent,
          fileName: file.fileName,
          filePath,
        }),
      );
    }
    await Promise.all(writeFilePromises);
  }

  private async writeToDisk(props: writeSourceTypes.WriteToDisk) {
    try {
      console.debug(`Writing file ${props.fileName} to path ${props.filePath ?? '.'}`);
      let filePath = props.fileName;
      if (props.filePath) {
        await fs.mkdir(props.filePath, { recursive: true });
        filePath = path.join(props.filePath, props.fileName);
      }

      await fs.writeFile(filePath, props.fileContent);
      console.debug(`Wrote file to path ${props.filePath ?? '.'}/${props.fileName}`);
    } catch (err) {
      console.log(`Could not write file ${props.fileName} to path ${props.filePath ?? '.'}`);
      throw err;
    }
  }

  private setFilePath(props: { baseDirectory?: string; path?: string }): string | undefined {
    let filePath;
    if (props.baseDirectory && !props.path) {
      filePath = props.baseDirectory;
    }
    if (props.path && !props.baseDirectory) {
      filePath = props.path;
    }
    if (props.baseDirectory && props.path) {
      filePath = path.join(props.baseDirectory, props.path);
    }

    return filePath;
  }
}
