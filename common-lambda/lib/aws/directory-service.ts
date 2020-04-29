import * as aws from 'aws-sdk';
import * as ds from 'aws-sdk/clients/directoryservice';

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
    const result = await this.client.shareDirectory(input).promise();
    return result.SharedDirectoryId!;
  }

  /**
   *
   * Accepts a directory sharing request that was sent from the directory owner account
   *
   * @param AcceptSharedDirectoryRequest
   */
  async acceptDirectory(input: ds.AcceptSharedDirectoryRequest): Promise<void> {
    await this.client.acceptSharedDirectory(input).promise();
  }

  /**
   *
   * Creates a subscription to forward real-time Directory Service domain controller
   * security logs to the specified Amazon CloudWatch log group
   *
   * @param CreateLogSubscriptionRequest
   */
  async enableCloudWatchLogs(input: ds.CreateLogSubscriptionRequest): Promise<void> {
    await this.client.createLogSubscription(input).promise();
  }

  /**
   *
   * Creates an AD Connector to connect to a directory
   *
   * @param ConnectDirectoryRequest
   */
  async createAdConnector(input: ds.ConnectDirectoryRequest): Promise<string> {
    const result = await this.client.connectDirectory(input).promise();
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
    const result = await this.client.listLogSubscriptions(input).promise();
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
    const result = await this.client.describeSharedDirectories(input).promise();
    const sharedDirectoriesResult = result.SharedDirectories;
    const sharedAccounts = sharedDirectoriesResult!.map(o => o.SharedAccountId!);
    return sharedAccounts;
  }

  /**
   *
   * This method will return existing AD Connectors in the account
   *
   * @param DescribeDirectoriesRequest
   */
  async getADConnectors(): Promise<{ directorId: string; status: string; domain: string }[]> {
    const result = await this.client.describeDirectories().promise();
    const directoriesResult = result.DirectoryDescriptions;
    const adConnectors = directoriesResult!
      .filter(d => d.Type === 'ADConnector')
      .map(o => ({
        directorId: o.DirectoryId!,
        status: o.Stage!,
        domain: o.Name!,
      }));
    return adConnectors;
  }
}
