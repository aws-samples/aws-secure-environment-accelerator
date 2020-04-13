import * as aws from 'aws-sdk';

export class RAM {
  private readonly client: aws.RAM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.RAM({
      credentials,
    });
  }

  async enableResourceSharing(): Promise<void> {
    const params = {};
    this.client.enableSharingWithAwsOrganization(params, function (err, data) {
      // an error occurred
      if (err) console.log(err, err.stack);
      else console.log(data); // successful response
    });
  }
}
