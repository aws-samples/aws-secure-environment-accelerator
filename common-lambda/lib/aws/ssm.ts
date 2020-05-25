import * as aws from 'aws-sdk';
import * as sts from 'aws-sdk/clients/ssm';

export class SSM {
  private readonly client: aws.SSM;
  private readonly cache: { [roleArn: string]: aws.Credentials } = {};

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.SSM({
      credentials,
    });
  }

  async getParameter(name: string): Promise<sts.GetParameterResult> {
    return this.client
      .getParameter({
        Name: name,
      })
      .promise();
  }
}
