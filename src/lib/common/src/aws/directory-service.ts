import aws from './aws-client';
import * as ds from 'aws-sdk/clients/directoryservice';
import { throttlingBackOff } from './backoff';

export class DirectoryService {
  private readonly client: aws.DirectoryService;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.DirectoryService({
      credentials,
    });
  }

  /**
   *
   * Shares a specified directory (DirectoryId) in the AWS account with another AWS account
   *
   * @param ShareDirectoryRequest
   */
  async shareDirectory(input: ds.ShareDirectoryRequest): Promise<string> {
    const result = await throttlingBackOff(() => this.client.shareDirectory(input).promise());
    return result.SharedDirectoryId!;
  }

  /**
   *
   * Accepts a directory sharing request that was sent from the directory owner account
   *
   * @param AcceptSharedDirectoryRequest
   */
  async acceptDirectory(input: ds.AcceptSharedDirectoryRequest): Promise<void> {
    await throttlingBackOff(() => this.client.acceptSharedDirectory(input).promise());
  }

  /**
   *
   * Creates a subscription to forward real-time Directory Service domain controller
   * security logs to the specified Amazon CloudWatch log group
   *
   * @param CreateLogSubscriptionRequest
   */
  async enableCloudWatchLogs(input: ds.CreateLogSubscriptionRequest): Promise<void> {
    await throttlingBackOff(() => this.client.createLogSubscription(input).promise());
  }

  /**
   *
   * Creates an AD Connector to connect to a directory
   *
   * @param ConnectDirectoryRequest
   */
  async createAdConnector(input: ds.ConnectDirectoryRequest): Promise<string> {
    const result = await throttlingBackOff(() => this.client.connectDirectory(input).promise());
    return result.DirectoryId!;
  }

  /**
   *
   * This method will take input of Directory Id and returns true if there
   * are active log subscriptions to the directory
   *
   * @param ListLogSubscriptionsRequest
   */
  async hasLogGroup(input: ds.ListLogSubscriptionsRequest): Promise<boolean> {
    const result = await throttlingBackOff(() => this.client.listLogSubscriptions(input).promise());
    return result.LogSubscriptions!.length > 0;
  }

  /**
   *
   * This method will take input of Directory Id and returns the list of Account Ids
   * that the directory is shared with other accounts
   *
   * @param DescribeSharedDirectoriesRequest
   */
  async findSharedAccounts(input: ds.DescribeSharedDirectoriesRequest): Promise<string[]> {
    let nextToken;
    const allSharedDirectories: string[] = [];
    do {
      input.NextToken = nextToken;
      const response = await throttlingBackOff(() => this.client.describeSharedDirectories(input).promise());
      for (const directory of response.SharedDirectories!) {
        if (directory.SharedAccountId && !allSharedDirectories.includes(directory.SharedAccountId)) {
          allSharedDirectories.push(directory.SharedAccountId);
        }
      }
      nextToken = response.NextToken;
    } while (nextToken);
    return allSharedDirectories;
  }

  /**
   *
   * This method will return existing AD Connectors in the account
   *
   */
  async getADConnectors(): Promise<{ directoryId: string; status: string; domain: string }[]> {
    const result = await throttlingBackOff(() => this.client.describeDirectories().promise());
    const directoriesResult = result.DirectoryDescriptions;
    const adConnectors = directoriesResult!
      .filter(d => d.Type === 'ADConnector')
      .map(o => ({
        directoryId: o.DirectoryId!,
        status: o.Stage!,
        domain: o.Name!,
      }));
    return adConnectors;
  }
}
