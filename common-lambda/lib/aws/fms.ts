import * as aws from 'aws-sdk';
import * as fms from 'aws-sdk/clients/fms';

export class FMS {
  private readonly client: aws.FMS;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.FMS({
      region: 'us-east-1', // us-east-1 is the only endpoint available
      credentials,
    });
  }

  async associateAdminAccount(adminAccountId: string): Promise<void> {
    const params: fms.AssociateAdminAccountRequest = {
      AdminAccount: adminAccountId,
    };
    await this.client.associateAdminAccount(params).promise();
  }
}
