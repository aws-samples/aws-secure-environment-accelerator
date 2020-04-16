import * as aws from 'aws-sdk';

export class RAM {
  private readonly client: aws.RAM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.RAM({
      credentials,
    });
  }

  async enableResourceSharing(): Promise<void> {
    await this.client.enableSharingWithAwsOrganization({}).promise();
  }
}
