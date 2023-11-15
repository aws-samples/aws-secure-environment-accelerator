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

import aws from 'aws-sdk';

import {
  BatchGetRepositoriesCommandOutput,
  CodeCommit,
  CreateCommitCommandInput,
  CreateRepositoryCommandOutput,
  DeleteFileCommandInput,
  DeleteFileCommandOutput,
  GetBranchCommandOutput,
  GetFileCommandOutput,
  PutFileCommandInput,
  PutFileCommandOutput,
} from '@aws-sdk/client-codecommit';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';

export class CodeCommit {
  private readonly client: CodeCommit;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new CodeCommit({
      credentials,
      region,
      logger: console,
    });
  }

  /**
   * Get File from Code Commit
   * @param repositoryName
   * @param filePath
   */
  async getFile(repositoryName: string, filePath: string, commitId?: string): Promise<GetFileCommandOutput> {
    return throttlingBackOff(() =>
      this.client
        .getFile({
          repositoryName,
          filePath,
          commitSpecifier: commitId!,
        })
        .promise(),
    );
  }

  /**
   * Put File from Code Commit
   * @param putFileInput
   */
  async putFile(putFileInput: PutFileCommandInput): Promise<PutFileCommandOutput> {
    return throttlingBackOff(() => this.client.putFile(putFileInput).promise());
  }

  /**
   * Get Repository from Code Commit
   * @param repositoryName
   */
  async batchGetRepositories(repositoryNames: string[]): Promise<BatchGetRepositoriesCommandOutput> {
    return throttlingBackOff(() =>
      this.client
        .batchGetRepositories({
          repositoryNames,
        })
        .promise(),
    );
  }

  /**
   * Get Branch from Repository in Code Commit
   * @param repositoryName
   * @param branchName
   */
  async getBranch(repositoryName: string, branchName: string): Promise<GetBranchCommandOutput> {
    return throttlingBackOff(() =>
      this.client
        .getBranch({
          repositoryName,
          branchName,
        })
        .promise(),
    );
  }

  /**
   * Create Repository in Code Commit
   * @param repositoryName
   */
  async createRepository(repositoryName: string, repositoryDescription: string): Promise<CreateRepositoryCommandOutput> {
    return throttlingBackOff(() =>
      this.client
        .createRepository({
          repositoryName,
          repositoryDescription,
        })
        .promise(),
    );
  }

  /**
   * Create Commit in Code Commit Repository
   * @param input: CreateCommitInput
   */
  async commit(input: CreateCommitCommandInput): Promise<string> {
    const response = await throttlingBackOff(() => this.client.createCommit(input).promise());
    return response.commitId!;
  }

  /**
   * Put File from Code Commit
   * @param putFileInput
   */
  async deleteFile(input: DeleteFileCommandInput): Promise<DeleteFileCommandOutput> {
    return throttlingBackOff(() => this.client.deleteFile(input).promise());
  }

  /**
   * Create Branch in Code Commit Repository
   * @param repositoryName
   * @param branchName
   * @param commitId
   */
  async createBranch(repositoryName: string, branchName: string, commitId: string) {
    return throttlingBackOff(() =>
      this.client
        .createBranch({
          branchName,
          commitId,
          repositoryName,
        })
        .promise(),
    );
  }

  /**
   * Update Default branch of Code Commit Repository
   * @param repositoryName
   * @param branchName
   */
  async updateDefaultBranch(repositoryName: string, branchName: string) {
    return throttlingBackOff(() =>
      this.client
        .updateDefaultBranch({
          repositoryName,
          defaultBranchName: branchName,
        })
        .promise(),
    );
  }
}
