const { AssumeRoleProviderSource } = require('./assume-role-provider-source');

class AssumeProfilePlugin {
  constructor() {
    this.version = '1';
    this.assumeRoleName = process.env.CDK_PLUGIN_ASSUME_ROLE_NAME;
  }

  init(host) {
    const source = new AssumeRoleProviderSource('cdk-assume-role-plugin', this.assumeRoleName);
    host.registerCredentialProviderSource(source);
  }
}

module.exports = { AssumeProfilePlugin };
