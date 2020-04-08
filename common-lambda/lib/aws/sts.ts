import * as aws from 'aws-sdk';
import * as sts from 'aws-sdk/clients/sts';

export class STS {
  private readonly client: aws.STS;

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.STS({
      credentials,
    });
  }

  async getCallerIdentity(): Promise<sts.GetCallerIdentityResponse> {
    return this.client.getCallerIdentity().promise();
  }

  async getCredentialsForRoleArn(assumeRoleArn: string, durationSeconds: number = 3600): Promise<aws.Credentials> {
    const response = await this.client
      .assumeRole({
        RoleArn: assumeRoleArn,
        RoleSessionName: 'temporary', // TODO Generate a random name
        DurationSeconds: durationSeconds,
      })
      .promise();

    const result = response.Credentials!!;
    return new aws.Credentials({
      accessKeyId: result.AccessKeyId,
      secretAccessKey: result.SecretAccessKey,
      sessionToken: result.SessionToken,
    });
  }

  async getCredentialsForAccountAndRole(
    accountId: string,
    assumeRole: string,
    durationSeconds?: number,
  ): Promise<aws.Credentials> {
    return this.getCredentialsForRoleArn(`arn:aws:iam::${accountId}:role/${assumeRole}`, durationSeconds);
  }
}
