import * as aws from 'aws-sdk';
import * as ds from 'aws-sdk/clients/directoryservice';

export class DirectoryService {
  private readonly client: aws.DirectoryService;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.DirectoryService({
      credentials,
    });
  }

  async shareDirectory(input: ds.ShareDirectoryRequest): Promise<string> {
    const result = await this.client.shareDirectory(input).promise();
    return result.SharedDirectoryId!;
  }

  async acceptDirectory(input: ds.AcceptSharedDirectoryRequest): Promise<void> {
    await this.client.acceptSharedDirectory(input).promise();
  }

  async enableCloudWatchLogs(input: ds.CreateLogSubscriptionRequest): Promise<void> {
    await this.client.createLogSubscription(input).promise();
  }

  async createAdConnector(input: ds.ConnectDirectoryRequest): Promise<void> {
    await this.client.connectDirectory(input).promise();
  }

  async hasLogGroup(input: ds.ListLogSubscriptionsRequest): Promise<boolean> {
    const result = await this.client.listLogSubscriptions(input).promise();
    return result.LogSubscriptions!.length > 0;
  }

  async describeSharedDirectories(input: ds.DescribeSharedDirectoriesRequest): Promise<string[]> {
    const result = await this.client.describeSharedDirectories(input).promise();
    const sharedDirectoriesResult = result.SharedDirectories;
    const sharedAccounts = sharedDirectoriesResult!.map(o => o.SharedAccountId!);
    return sharedAccounts;
  }
}
