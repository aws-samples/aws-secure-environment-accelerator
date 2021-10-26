/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as t from '@aws-accelerator/common-types';
import * as c from '@aws-accelerator/config';

export * from '@aws-accelerator/config';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CloudWatchDefaultAlarmDefinition extends Omit<c.CloudWatchAlarmsConfig, 'definitions'> {
  /**
   * Interface definition for Default definition of CloudWatch alarm
   * from "CloudWatchAlarmsConfig" excluding definitions
   */
}

export interface ResolvedConfigBase {
  /**
   * The organizational unit to which this VPC belongs.
   */
  ouKey?: string;
  /**
   * The resolved account key where the VPC should be deployed.
   */
  accountKey: string;
}

export interface ResolvedVpcConfig extends ResolvedConfigBase {
  /**
   * The VPC config to be deployed.
   */
  vpcConfig: c.VpcConfig;
  /**
   * Deployment config
   */
  deployments?: c.DeploymentConfig;
}

export interface ResolvedCertificateConfig extends ResolvedConfigBase {
  /**
   * The certificates config to be deployed.
   */
  certificates: c.CertificateConfig[];
}

export interface ResolvedIamConfig extends ResolvedConfigBase {
  /**
   * The IAM config to be deployed.
   */
  iam: c.IamConfig;
}

export interface ResolvedAlbConfig extends ResolvedConfigBase {
  /**
   * The albs config to be deployed.
   */
  albs: (c.AlbConfigType | c.GwlbConfigType)[];
}

export interface ResolvedMadConfig extends ResolvedConfigBase {
  /**
   * The mad config to be deployed.
   */
  mad: c.MadDeploymentConfig;
}

export interface ResolvedRsysLogConfig extends ResolvedConfigBase {
  /**
   * The rsyslog config to be deployed.
   */
  rsyslog: c.RsyslogConfig;
}

export class AcceleratorConfig implements t.TypeOf<typeof c.AcceleratorConfigType> {
  readonly 'replacements': c.ReplacementsConfig;
  readonly 'global-options': c.GlobalOptionsConfig;
  readonly 'mandatory-account-configs': c.AccountsConfig;
  readonly 'workload-account-configs': c.AccountsConfig;
  readonly 'organizational-units': c.OrganizationalUnitsConfig;

  constructor(values: t.TypeOf<typeof c.AcceleratorConfigType>) {
    Object.assign(this, values);
  }

  /**
   * @return AccountConfig
   */
  getAccountByKey(accountKey: string): c.AccountConfig {
    return this['mandatory-account-configs'][accountKey] ?? this['workload-account-configs'][accountKey];
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getMandatoryAccountConfigs(): [string, c.AccountConfig][] {
    return Object.entries(this['mandatory-account-configs']);
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getWorkloadAccountConfigs(): [string, c.AccountConfig][] {
    return Object.entries(this['workload-account-configs']).filter(([_, value]) => !value.deleted);
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getAccountConfigs(): [string, c.AccountConfig][] {
    return [...this.getMandatoryAccountConfigs(), ...this.getWorkloadAccountConfigs()];
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getAccountConfigsForOu(ou: string): [string, c.AccountConfig][] {
    return this.getAccountConfigs().filter(([_, accountConfig]) => accountConfig.ou === ou);
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getOrganizationalUnits(): [string, c.OrganizationalUnitConfig][] {
    return Object.entries(this['organizational-units']);
  }

  /**
   * @return string // Account Key for Mandatory accounts
   */
  getMandatoryAccountKey(accountName: c.MandatoryAccountType): string {
    if (accountName === 'master') {
      return this['global-options']['aws-org-management'].account;
    } else if (accountName === 'central-security') {
      return this['global-options']['central-security-services'].account;
    } else if (accountName === 'central-operations') {
      return this['global-options']['central-operations-services'].account;
    } else if (accountName === 'central-log') {
      return this['global-options']['central-log-services'].account;
    } else {
      // Invalid account name
      throw new Error(`Invalid Account Type sent to "getMandatoryAccountKey"`);
    }
  }

  /**
   * Find all VPC configurations in mandatory accounts, workload accounts and organizational units. VPC configuration in
   * organizational units will have the correct `accountKey` based on the `deploy` value of the VPC configuration.
   */
  getVpcConfigs(): ResolvedVpcConfig[] {
    const vpcConfigs: ResolvedVpcConfig[] = [];

    // Add mandatory account VPC configuration first
    for (const [accountKey, accountConfig] of this.getMandatoryAccountConfigs()) {
      for (const vpcConfig of accountConfig.vpc || []) {
        vpcConfigs.push({
          accountKey,
          vpcConfig,
          deployments: accountConfig.deployments,
        });
      }
    }

    const prioritizedOus = this.getOrganizationalUnits();
    // Sort OUs by OU priority
    // Config for mandatory OUs should be first in the list
    prioritizedOus.sort(([_, ou1], [__, ou2]) => priorityByOuType(ou1, ou2));

    for (const [ouKey, ouConfig] of prioritizedOus) {
      for (const vpcConfig of ouConfig.vpc || []) {
        const destinationAccountKey = vpcConfig.deploy;
        if (destinationAccountKey === 'local') {
          // When deploy is 'local' then the VPC should be deployed in all accounts in the OU
          for (const [accountKey, accountConfig] of this.getAccountConfigsForOu(ouKey)) {
            if (vpcConfig['opt-in']) {
              if (!accountConfig['opt-in-vpcs'] || !accountConfig['opt-in-vpcs'].includes(vpcConfig.name)) {
                continue;
              }
            }
            vpcConfigs.push({
              ouKey,
              accountKey,
              vpcConfig,
              deployments: accountConfig.deployments,
            });
          }
        } else {
          // When deploy is not 'local' then the VPC should only be deployed in the given account
          vpcConfigs.push({
            ouKey,
            accountKey: destinationAccountKey,
            vpcConfig,
          });
        }
      }
    }

    // Add workload accounts as they are lower priority
    for (const [accountKey, accountConfig] of this.getWorkloadAccountConfigs()) {
      for (const vpcConfig of accountConfig.vpc || []) {
        vpcConfigs.push({
          accountKey,
          vpcConfig,
          deployments: accountConfig.deployments,
        });
      }
    }

    return vpcConfigs;
  }

  /**
   * Find all VPC configurations in mandatory accounts, workload accounts and organizational units. VPC configuration in
   * organizational units will have the correct `accountKey` based on the `deploy` value of the VPC configuration.
   */
  getVpcConfigs2(): ResolvedVpcConfig[] {
    const result: ResolvedVpcConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const vpcConfigs = config.vpc;
      if (!vpcConfigs || vpcConfigs.length === 0) {
        continue;
      }
      if (c.MandatoryAccountConfigType.is(config)) {
        for (const vpcConfig of vpcConfigs) {
          result.push({
            accountKey: key,
            vpcConfig,
            deployments: config.deployments,
          });
        }
      } else if (c.OrganizationalUnitConfigType.is(config)) {
        for (const vpcConfig of vpcConfigs) {
          const destinationAccountKey = vpcConfig.deploy;
          if (destinationAccountKey === 'local') {
            // When deploy is 'local' then the VPC should be deployed in all accounts in the OU
            for (const [accountKey, accountConfig] of this.getAccountConfigsForOu(key)) {
              result.push({
                ouKey: key,
                accountKey,
                vpcConfig,
                deployments: accountConfig.deployments,
              });
            }
          } else {
            // When deploy is not 'local' then the VPC should only be deployed in the given account
            result.push({
              ouKey: key,
              accountKey: destinationAccountKey,
              vpcConfig,
            });
          }
        }
      }
    }
    return result;
  }

  /**
   * Find all certificate configurations in mandatory accounts, workload accounts and organizational units.
   */
  getCertificateConfigs(): ResolvedCertificateConfig[] {
    const result: ResolvedCertificateConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const certificates = config.certificates;
      if (!certificates || certificates.length === 0) {
        continue;
      }
      if (c.MandatoryAccountConfigType.is(config)) {
        result.push({
          accountKey: key,
          certificates,
        });
      } else if (c.OrganizationalUnitConfigType.is(config)) {
        for (const [accountKey, _] of this.getAccountConfigsForOu(key)) {
          result.push({
            ouKey: key,
            accountKey,
            certificates,
          });
        }
      }
    }
    return result;
  }

  /**
   * Find all IAM configurations in mandatory accounts, workload accounts and organizational units.
   */
  getIamConfigs(): ResolvedIamConfig[] {
    const result: ResolvedIamConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const iam = config.iam;
      if (!iam) {
        continue;
      }
      if (c.MandatoryAccountConfigType.is(config)) {
        result.push({
          accountKey: key,
          iam,
        });
      } else if (c.OrganizationalUnitConfigType.is(config)) {
        for (const [accountKey, _] of this.getAccountConfigsForOu(key)) {
          result.push({
            ouKey: key,
            accountKey,
            iam,
          });
        }
      }
    }
    return result;
  }

  /**
   * Find all alb configurations in mandatory accounts, workload accounts and organizational units.
   */
  getElbConfigs(): ResolvedAlbConfig[] {
    const result: ResolvedAlbConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const albs = config.alb;
      if (!albs || albs.length === 0) {
        continue;
      }
      if (c.MandatoryAccountConfigType.is(config)) {
        result.push({
          accountKey: key,
          albs,
        });
      } else if (c.OrganizationalUnitConfigType.is(config)) {
        for (const [accountKey, _] of this.getAccountConfigsForOu(key)) {
          result.push({
            ouKey: key,
            accountKey,
            albs,
          });
        }
      }
    }
    return result;
  }

  /**
   * Find all mad configurations in mandatory accounts, workload accounts and organizational units.
   */
  getMadConfigs(): ResolvedMadConfig[] {
    const result: ResolvedMadConfig[] = [];
    for (const [key, config] of this.getAccountConfigs()) {
      const mad = config.deployments?.mad;
      if (!mad) {
        continue;
      }
      result.push({
        accountKey: key,
        mad,
      });
    }
    return result;
  }

  /**
   * Find all rsyslog configurations in mandatory accounts, workload accounts and organizational units.
   */
  getRsysLogConfigs(): ResolvedRsysLogConfig[] {
    const result: ResolvedRsysLogConfig[] = [];
    for (const [key, config] of this.getAccountConfigs()) {
      const rsyslog = config.deployments?.rsyslog;
      if (!rsyslog) {
        continue;
      }
      result.push({
        accountKey: key,
        rsyslog,
      });
    }
    return result;
  }

  /**
   * Iterate all account configs and organizational unit configs in order.
   */
  private *getAccountAndOuConfigs(): IterableIterator<[string, c.MandatoryAccountConfig | c.OrganizationalUnitConfig]> {
    // Add mandatory account VPC configuration first
    for (const [accountKey, accountConfig] of this.getMandatoryAccountConfigs()) {
      yield [accountKey, accountConfig];
    }

    const prioritizedOus = this.getOrganizationalUnits();
    // Sort OUs by OU priority
    // Config for mandatory OUs should be first in the list
    prioritizedOus.sort(([_, ou1], [__, ou2]) => priorityByOuType(ou1, ou2));

    for (const [ouKey, ouConfig] of prioritizedOus) {
      yield [ouKey, ouConfig];
    }

    // Add workload accounts as they are lower priority
    for (const [accountKey, accountConfig] of this.getWorkloadAccountConfigs()) {
      yield [accountKey, accountConfig];
    }
  }

  static fromBuffer(content: Buffer): AcceleratorConfig {
    return this.fromString(content.toString());
  }

  static fromString(content: string): AcceleratorConfig {
    return this.fromObject(JSON.parse(content));
  }

  static fromObject<S>(content: S): AcceleratorConfig {
    const values = t.parse(c.AcceleratorConfigType, content);
    return new AcceleratorConfig(values);
  }
}

function priorityByOuType(ou1: c.OrganizationalUnit, ou2: c.OrganizationalUnit) {
  // Mandatory has highest priority
  if (ou1.type === 'mandatory') {
    return -1;
  }
  return 1;
}

export class AcceleratorUpdateConfig extends AcceleratorConfig {
  'replacements': c.ReplacementsConfig;
  'global-options': c.GlobalOptionsConfig;
  'mandatory-account-configs': c.AccountsConfig;
  'workload-account-configs': c.AccountsConfig;
  'organizational-units': c.OrganizationalUnitsConfig;

  constructor(values: t.TypeOf<typeof c.AcceleratorConfigType>) {
    super(values);
    Object.assign(this, values);
  }
}
