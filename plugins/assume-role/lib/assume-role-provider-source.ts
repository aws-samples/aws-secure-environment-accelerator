import * as aws from 'aws-sdk';
import { CredentialProviderSource, Mode } from 'aws-cdk/lib/api/aws-auth/credentials';
import { green } from 'colors/safe';

export class AssumeRoleProviderSource implements CredentialProviderSource {
  readonly name: string;
  private readonly assumeRoleName: string;
  private readonly cache: { [accountId: string]: aws.Credentials } = {};

  constructor(name: string, assumeRoleName: string) {
    this.name = name;
    this.assumeRoleName = assumeRoleName;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async canProvideCredentials(accountId: string): Promise<boolean> {
    return true;
  }

  async getProvider(accountId: string, mode: Mode): Promise<aws.Credentials> {
    if (this.cache[accountId]) {
      return this.cache[accountId];
    }

    const roleArn = `arn:aws:iam::${accountId}:role/${this.assumeRoleName}`;
    console.log(`Assuming role ${green(roleArn)}`);

    const sts = new aws.STS();
    const response = await sts
      .assumeRole({
        RoleArn: roleArn,
        RoleSessionName: this.name,
        DurationSeconds: 3600,
      })
      .promise();

    const result = response.Credentials!;
    return (this.cache[accountId] = new aws.Credentials({
      accessKeyId: result.AccessKeyId,
      secretAccessKey: result.SecretAccessKey,
      sessionToken: result.SessionToken,
    }));
  }
}
