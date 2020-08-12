import * as aws from 'aws-sdk';
import { throttlingBackOff } from './backoff';

export class FMS {
  private readonly client: aws.FMS;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.FMS({
      region: 'us-east-1', // us-east-1 is the only endpoint available
      credentials,
    });
  }

  async associateAdminAccount(adminAccountId: string): Promise<void> {
    await throttlingBackOff(() =>
      this.client
        .associateAdminAccount({
          AdminAccount: adminAccountId,
        })
        .promise(),
    );
  }
}
