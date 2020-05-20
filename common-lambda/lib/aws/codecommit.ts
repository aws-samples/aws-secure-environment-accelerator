import * as aws from 'aws-sdk';
import {
  GetFileOutput,
  PutFileOutput,
  PutFileInput,
  GetBranchOutput,
  CreateRepositoryOutput,
  BatchGetRepositoriesOutput,
} from 'aws-sdk/clients/codecommit';
export class CodeCommit {
  private readonly client: aws.CodeCommit;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.CodeCommit({
      credentials,
    });
  }

  /**
   * Get File from Code Commit
   * @param repositoryName
   * @param filePath
   */
  async getFile(repositoryName: string, filePath: string, commitId?: string): Promise<GetFileOutput> {
    return this.client
      .getFile({
        repositoryName,
        filePath,
        commitSpecifier: commitId!,
      })
      .promise();
  }

  /**
   * Put File from Code Commit
   * @param putFileInput
   */
  async putFile(putFileInput: PutFileInput): Promise<PutFileOutput> {
    return this.client.putFile(putFileInput).promise();
  }

  /**
   * Get Repository from Code Commit
   * @param repositoryName
   */
  async batchGetRepositories(repositoryNames: string[]): Promise<BatchGetRepositoriesOutput> {
    return this.client
      .batchGetRepositories({
        repositoryNames,
      })
      .promise();
  }

  /**
   * Get Branch from Repository in Code Commit
   * @param repositoryName
   * @param branchName
   */
  async getBranch(repositoryName: string, branchName: string): Promise<GetBranchOutput> {
    return this.client
      .getBranch({
        repositoryName,
        branchName,
      })
      .promise();
  }

  /**
   * Create Repository in Code Commit
   * @param repositoryName
   */
  async createRepository(repositoryName: string, repositoryDescription: string): Promise<CreateRepositoryOutput> {
    return this.client
      .createRepository({
        repositoryName,
        repositoryDescription,
      })
      .promise();
  }
}
