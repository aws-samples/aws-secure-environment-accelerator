import { AcceleratorConfig, IamRoleConfig } from '../asea-config';

export class ConfigCheck {
  private warnings: string[] = [];
  private errors: string[] = [];

  public addError(error: string) {
    this.errors.push(error);
    console.error(error);
  }

  public addWarning(warning: string) {
    this.warnings.push(warning);
  }

  /**
   * Function that calls other functions to check for unsupported configurations.
   * @param aseaConfig
   */
  public async checkUnsupportedConfig(aseaConfig: AcceleratorConfig) {
    await this.checkLoadBalancersConfig(aseaConfig);
    await this.checkRoute53ZonesConfig(aseaConfig);
    this.madWarnings(aseaConfig);
    this.rsyslogWarnings(aseaConfig);
    this.firewallWarnings(aseaConfig);
    this.kinesisShardWarning(aseaConfig);
  }

  /**
   * Function that checks for public hosted zones in ASEA config and sends warning.
   * @param aseaConfig
   */
  private async checkRoute53ZonesConfig(aseaConfig: AcceleratorConfig) {
    // Check VPCs in Mandatory accounts
    Object.entries(aseaConfig['mandatory-account-configs']).forEach(([accountKey, accountConfig]) => {
      for (const vpcItem of accountConfig.vpc ?? []) {
        if (vpcItem.zones?.public) {
          this.warnings.push(
            `The VPC ${vpcItem.name} in account ${accountKey} utilizes a public Route53 zone: ${vpcItem.zones?.public.join(' ,')}. Please refer to documentation on how to manage these resources.`,
          );
        }
      }
    });
    // Check VPCs in Workload accounts
    Object.entries(aseaConfig['workload-account-configs']).forEach(([accountKey, accountConfig]) => {
      for (const vpcItem of accountConfig.vpc ?? []) {
        if (vpcItem.zones?.public) {
          this.warnings.push(
            `The VPC ${vpcItem.name} in account ${accountKey} utilizes a public Route53 zone: ${vpcItem.zones?.public.join(' ,')}. Please refer to documentation on how to manage these resources.`,
          );
        }
      }
    });
    // Check shared VPCs for OUs
    Object.entries(aseaConfig['organizational-units']).forEach(([ouKey, organizationConfig]) => {
      for (const vpcItem of organizationConfig.vpc ?? []) {
        if (vpcItem.zones?.public) {
          this.warnings.push(
            `The VPC ${vpcItem.name} in OU ${ouKey} utilizes a public Route53 zone: ${vpcItem.zones?.public.join(' ,')}. Please refer to documentation on how to manage these resources.`,
          );
        }

        //check local VPC defined at OU level
        if (vpcItem.deploy === 'local') {
            this.warnings.push(
              `The VPC ${vpcItem.name} in OU ${ouKey} is set to deploy \'local\' in each account. You need to add a vpcTemplate to your configuration to keep the same behavior for new accounts in this OU.`,
            );
        }
      }
    });
  }

  /**
   * Function that checks for Gateway Load Balancers in ASEA config.
   * @param aseaConfig
   */
  private async checkLoadBalancersConfig(aseaConfig: AcceleratorConfig) {
    Object.entries(aseaConfig['mandatory-account-configs']).forEach(([accountKey, accountConfig]) => {
      for (const loadBalancerItem of accountConfig.alb ?? []) {
        if (loadBalancerItem.type === 'GWLB') {
          this.warnings.push(
            `The account ${accountKey} utilizes a Gateway Load Balancer: ${loadBalancerItem.name}. Please refer to documentation on how to manage these resources.`,
          );
        }
      }
    });

    Object.entries(aseaConfig['workload-account-configs']).forEach(([accountKey, accountConfig]) => {
      for (const loadBalancerItem of accountConfig.alb ?? []) {
        if (loadBalancerItem.type === 'GWLB') {
          this.warnings.push(
            `The account ${accountKey} utilizes a Gateway Load Balancer: ${loadBalancerItem.name}. Please refer to documentation on how to manage these resources.`,
          );
        }
      }
    });

    Object.entries(aseaConfig['organizational-units']).forEach(([ouKey, organizationConfig]) => {
      if (organizationConfig.alb) {
        for (const loadBalancerItem of organizationConfig.alb ?? []) {
          if (loadBalancerItem.type === 'GWLB') {
            this.warnings.push(
              `The organizational unit ${ouKey} utilizes a Gateway Load Balancer: ${loadBalancerItem.name}. Please refer to documentation on how to manage these resources.`,
            );
          }
        }
      }
    });
  }

  /**
   * Check if roles reference an external trust policy
   * @param aseaConfig
   */
  public checkIamWithExternalTrustPolicy(roles: IamRoleConfig[], msg: string) {
    for (const role of roles) {
      if (role['trust-policy']) {
        this.warnings.push(
          `The role ${role.role} in ${msg} references an external trust policy. Not all policies are supported. Please refer to documentation on how to manage these resources.`,
        );
      }
    }
  }


  /**
   * Function that checks trust policies for IAM Roles and unsupported types.
   * Note: this is only checked in convert-config, not inventory mode because it requires downloading the trust policy from S3
   * @param aseaConfig
   */
  public async checkIamTrustsConfig(role: IamRoleConfig, trustPolicy: string) {
    const content = JSON.parse(trustPolicy);
    if (content.Statement.length >= 1) {
      for (const statementItem of content.Statement) {
        if (statementItem.Condition) {
          if (!statementItem.Condition.StringEquals) {
            this.warnings.push(
              `The trust policy for the role ${role.role} includes a condition with StringEquals doesn't support external IDs. Please refer to documentation on how to manage these resources.`,
            );
          }
          if (!statementItem.Condition.StringEquals?.['sts:ExternalId']) {
            this.warnings.push(
              `The trust policy for the role ${role.role} includes a condition that doesn't support external IDs. Please refer to documentation on how to manage these resources.`,
            );
          }
        } else if (statementItem.Action !== 'sts:AssumeRole' || statementItem.Action !== 'sts:AssumeRoleWithSAML') {
          this.warnings.push(
            `The trust policy for the role ${role.role} has an Action that doesn't use sts:AssumeRole or sts:AssumeRoleWithSAML. Please refer to documentation on how to manage these resources.`,
          );
        }
      }
    } else {
      if (content.Statement.Condition) {
        if (!content.Statement.Condition.StringEquals?.['sts:ExternalId']) {
          this.warnings.push(
            `The trust policy for the role ${role.role} includes a condition that doesn't support external IDs. Please refer to documentation on how to manage these resources.`,
          );
        } else if (content.Statement.Action !== 'sts:AssumeRole') {
          this.warnings.push(
            `The trust policy for the role ${role.role} has an Action that doesn't use sts:AssumeRole. Please refer to documentation on how to manage these resources.`,
          );
        }
      }
    }
  }

  private rsyslogWarnings(aseaConfig: AcceleratorConfig) {
    for (const accountKey of Object.keys(aseaConfig['mandatory-account-configs'])) {
      if (aseaConfig['mandatory-account-configs'][accountKey].deployments?.rsyslog &&
            aseaConfig['mandatory-account-configs'][accountKey].deployments?.rsyslog?.deploy) {
        this.addWarning(
          `rsyslog servers are deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade.`,
        );
      }
    }
  }

  private madWarnings(aseaConfig: AcceleratorConfig) {
    for (const accountKey of Object.keys(aseaConfig['mandatory-account-configs'])) {
      if (aseaConfig['mandatory-account-configs'][accountKey].deployments?.mad &&
      aseaConfig['mandatory-account-configs'][accountKey].deployments?.mad?.deploy) {
        this.addWarning(
          `Managed AD is deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade.`,
        );
      }
    }
  }

  private firewallWarnings(aseaConfig: AcceleratorConfig) {
    Object.entries(aseaConfig['mandatory-account-configs']).forEach(([accountKey, accountConfig]) => {
      if (accountConfig.deployments?.firewalls) {
        for (const firewall of accountConfig.deployments?.firewalls) {
          if (firewall.deploy && firewall.type === 'EC2') {
            this.addWarning(
              `Third-Party firewalls ${firewall.name} are deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade.`,
            );
          }
        }
      }
    });
  }

  private kinesisShardWarning(aseaConfig: AcceleratorConfig) {
    const securityConfig = aseaConfig['global-options']['central-security-services'];

    if (securityConfig['kinesis-stream-shard-count'] && securityConfig['kinesis-stream-shard-count'] !== 1) {
      this.addWarning(
        `Kinesis streams have a custom shard count defined in 'kinesis-stream-shard-count'. Please refer to documentation on how to manage this configuration after the upgrade.`,
      );
    }
  }

  public printWarnings() {
    if (!this.warnings || this.warnings.length <= 0) {
      return;
    }

    console.log('\x1b[33m');
    console.log('WARNING');
    console.log('========', '\x1b[0m');
    console.warn(
      'Some element of your configuration may not be automatically converted and need manual intervention',
    );
    console.warn('Review the following warnings');
    this.warnings.forEach((warning) => {
      console.warn(`\t- ${warning}`);
    });
    console.log('========');
  }

  public printErrors() {
    if (!this.errors || this.errors.length <= 0) {
      return;
    }

    console.log('\x1b[31m');
    console.log('ERROR');
    console.log('========', '\x1b[0m');
    this.errors.forEach((errors) => {
      console.error(`\t- ${errors}`);
    });
    console.log('========');
  }

  public getWarnings(): string[] {
    return this.warnings;
  }

  public getErrors(): string[] {
    return this.errors;
  }
}
