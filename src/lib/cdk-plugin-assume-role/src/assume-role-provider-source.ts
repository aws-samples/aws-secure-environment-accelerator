import * as aws from 'aws-sdk';
import { CredentialProviderSource, Mode } from 'aws-cdk/lib/api/aws-auth/credentials';
import { green } from 'colors/safe';
import { throttlingBackOff } from './backoff';

export interface AssumeRoleProviderSourceProps {
  name: string;
  assumeRoleName: string;
  assumeRoleDuration: number;
}

export class AssumeRoleProviderSource implements CredentialProviderSource {
  readonly name = this.props.name;
  private readonly cache: { [accountId: string]: aws.Credentials } = {};

  constructor(private readonly props: AssumeRoleProviderSourceProps) {}

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

    let assumeRole;
    try {
      // Try to assume the role with the given duration
      assumeRole = await this.assumeRole(accountId, this.props.assumeRoleDuration);
    } catch (e) {
      console.warn(`Cannot assume role for ${this.props.assumeRoleDuration} seconds: ${e}`);

      // If that fails, than try to assume the role for one hour
      assumeRole = await this.assumeRole(accountId, 3600);
    }

    const credentials = assumeRole.Credentials!;
    return (this.cache[accountId] = new aws.Credentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    }));
  }

  protected async assumeRole(accountId: string, duration: number): Promise<aws.STS.AssumeRoleResponse> {
    const roleArn = `arn:aws:iam::${accountId}:role/${this.props.assumeRoleName}`;
    console.log(`Assuming role ${green(roleArn)} for ${duration} seconds`);

    const sts = new aws.STS();
    return await throttlingBackOff(() =>
      sts
        .assumeRole({
          RoleArn: roleArn,
          RoleSessionName: this.name,
          DurationSeconds: duration,
        })
        .promise(),
    );
  }
}
