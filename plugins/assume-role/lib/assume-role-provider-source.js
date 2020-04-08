const aws = require('aws-sdk');
const { green } = require('colors/safe');

class AssumeRoleProviderSource {
  constructor(name, assumeRoleName) {
    this.name = name;
    this.assumeRoleName = assumeRoleName;
    this.cache = {};
  }

  async isAvailable() {
    return true;
  }

  async canProvideCredentials(accountId) {
    return true;
  }

  async getProvider(accountId, mode) {
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

    const result = response.Credentials;
    return (this.cache[accountId] = new aws.Credentials({
      accessKeyId: result.AccessKeyId,
      secretAccessKey: result.SecretAccessKey,
      sessionToken: result.SessionToken,
    }));
  }
}

module.exports = { AssumeRoleProviderSource };
