import aws from 'aws-sdk';

export class STS {
  private readonly client: aws.STS;

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.STS({
      credentials,
    });
  }

  async getCredentialsForRoleArn(assumeRoleArn: string): Promise<aws.Credentials> {
    const response = await this.client.assumeRole({
      RoleArn: assumeRoleArn,
      RoleSessionName: 'temporary',
    }).promise();

    const result = response.Credentials!!;
    return new aws.Credentials({
      accessKeyId: result.AccessKeyId,
      secretAccessKey: result.SecretAccessKey,
      sessionToken: result.SessionToken,
    });
  }

  async getCredentialsForAccountAndRole(accountId: string, assumeRole: string): Promise<aws.Credentials> {
    const response = await this.client.assumeRole({
      RoleArn: `arn:aws:iam::${accountId}:role/${assumeRole}`,
      RoleSessionName: 'temporary',
    }).promise();

    const result = response.Credentials!!;
    return new aws.Credentials({
      accessKeyId: result.AccessKeyId,
      secretAccessKey: result.SecretAccessKey,
      sessionToken: result.SessionToken,
    });
  }
}
