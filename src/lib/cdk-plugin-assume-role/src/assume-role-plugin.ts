import { Plugin, PluginHost } from 'aws-cdk/lib/plugin';
import { AssumeRoleProviderSource } from './assume-role-provider-source';

export class AssumeProfilePlugin implements Plugin {
  readonly version = '1';

  constructor(private readonly props: { assumeRoleName?: string; assumeRoleDuration?: number } = {}) {}

  init(host: PluginHost): void {
    const source = new AssumeRoleProviderSource({
      name: 'cdk-assume-role-plugin',
      assumeRoleName: this.props.assumeRoleName ?? AssumeProfilePlugin.getDefaultAssumeRoleName(),
      assumeRoleDuration: this.props.assumeRoleDuration ?? AssumeProfilePlugin.getDefaultAssumeRoleDuration(),
    });
    host.registerCredentialProviderSource(source);
  }

  static getDefaultAssumeRoleName(): string {
    return process.env.CDK_PLUGIN_ASSUME_ROLE_NAME!;
  }

  static getDefaultAssumeRoleDuration(): number {
    if (process.env.CDK_PLUGIN_ASSUME_ROLE_DURATION) {
      return +process.env.CDK_PLUGIN_ASSUME_ROLE_DURATION;
    }
    return 3600;
  }
}
