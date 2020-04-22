import * as aws from 'aws-sdk';
import * as ds from 'aws-sdk/clients/directoryservice';

export class DirectoryService {
  private readonly client: aws.DirectoryService;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.DirectoryService({
      credentials,
    });
  }

  async shareDirectory(input: ds.ShareDirectoryRequest): Promise<void> {
    await this.client.shareDirectory(input).promise();
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
}
