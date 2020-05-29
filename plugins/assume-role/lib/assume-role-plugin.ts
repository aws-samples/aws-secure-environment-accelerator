import { Plugin, PluginHost } from 'aws-cdk/lib/plugin';
import { AssumeRoleProviderSource } from './assume-role-provider-source';

export class AssumeProfilePlugin implements Plugin {
  readonly version = '1';
  private readonly assumeRoleName: string;

  constructor(props: { assumeRoleName?: string } = {}) {
    this.assumeRoleName = props.assumeRoleName ?? process.env.CDK_PLUGIN_ASSUME_ROLE_NAME!;
  }

  init(host: PluginHost) {
    const source = new AssumeRoleProviderSource('cdk-assume-role-plugin', this.assumeRoleName);
    host.registerCredentialProviderSource(source);
  }
}
