/* eslint-disable @typescript-eslint/member-ordering */
/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import * as yaml from 'js-yaml';

import { throttlingBackOff } from '../common/aws/backoff';
import * as t from './common-types';

/**
 * AWS Organizations configuration items.
 */
export abstract class OrganizationConfigTypes {
  static readonly organizationalUnitConfig = t.interface({
    name: t.nonEmptyString,
    ignore: t.optional(t.boolean),
  });

  static readonly organizationalUnitIdConfig = t.interface({
    name: t.nonEmptyString,
    id: t.nonEmptyString,
    arn: t.nonEmptyString,
  });

  static readonly quarantineNewAccountsConfig = t.interface({
    enable: t.boolean,
    scpPolicyName: t.optional(t.nonEmptyString),
  });

  static readonly serviceControlPolicyConfig = t.interface({
    name: t.nonEmptyString,
    description: t.nonEmptyString,
    policy: t.nonEmptyString,
    type: t.enums('Type', ['awsManaged', 'customerManaged'], 'Value should be a Service Control Policy Type'),
    strategy: t.optional(t.enums('Type', ['deny-list', 'allow-list'], 'Defines SCP strategy. Default: deny-list')),
    deploymentTargets: t.deploymentTargets,
  });

  static readonly tagPolicyConfig = t.interface({
    name: t.nonEmptyString,
    description: t.nonEmptyString,
    policy: t.nonEmptyString,
    deploymentTargets: t.deploymentTargets,
  });

  static readonly backupPolicyConfig = t.interface({
    name: t.nonEmptyString,
    description: t.nonEmptyString,
    policy: t.nonEmptyString,
    deploymentTargets: t.deploymentTargets,
  });

  static readonly organizationConfig = t.interface({
    enable: t.boolean,
    organizationalUnits: t.array(this.organizationalUnitConfig),
    organizationalUnitIds: t.optional(t.array(this.organizationalUnitIdConfig)),
    serviceControlPolicies: t.array(this.serviceControlPolicyConfig),
    taggingPolicies: t.array(this.tagPolicyConfig),
    backupPolicies: t.array(this.backupPolicyConfig),
    quarantineNewAccounts: t.optional(this.quarantineNewAccountsConfig),
  });
}

/**
 * *{@link OrganizationConfig} / {@link OrganizationalUnitConfig}*
 *
 * AWS Organizational Unit (OU) configuration
 *
 * @example
 * ```
 * organizationalUnits:
 *   - name: Sandbox
 *   - name: Suspended
 *     ignore: true
 * ```
 */
export abstract class OrganizationalUnitConfig
implements t.TypeOf<typeof OrganizationConfigTypes.organizationalUnitConfig> {
  /**
   * The name and nested path that you want to assign to the OU.
   * When referring to OU's in the other configuration files ensure
   * that the name matches what has been provided here.
   * For example if you wanted an OU directly off of root just supply the OU name.
   * Always configure all of the OUs in the path.
   * A nested OU configuration would be like this
   * - name: Sandbox
   * - name: Sandbox/Pipeline
   * - name: Sandbox/Development
   * - name: Sandbox/Development/Application1
   */
  readonly name: string = '';
  /**
   * Optional property used to ignore organizational unit and
   * the associated accounts
   * Default value is false
   */
  readonly ignore: boolean | undefined = undefined;
}

/**
 * *{@link OrganizationConfig} / {@link OrganizationalUnitIdConfig}
 *
 * Organizational unit id configuration
 *
 * @example
 * ```
 * organizationalUnitIds:
 *   - name: Sandbox
 *     id: o-abc123
 *     arn: <ARN_of_OU>
 * ```
 */
export abstract class OrganizationalUnitIdConfig
implements t.TypeOf<typeof OrganizationConfigTypes.organizationalUnitIdConfig> {
  /**
   * A name for the OU
   */
  readonly name: string = '';
  /**
   * OU id
   */
  readonly id: string = '';
  /**
   * OU arn
   */
  readonly arn: string = '';
}

/**
 * *{@link OrganizationConfig} / {@link QuarantineNewAccountsConfig}*
 *
 * Quarantine SCP application configuration
 *
 * @example
 * ```
 * quarantineNewAccounts:
 *   enable: true
 *   scpPolicyName: QuarantineAccounts
 * ```
 */
export abstract class QuarantineNewAccountsConfig
implements t.TypeOf<typeof OrganizationConfigTypes.quarantineNewAccountsConfig> {
  /**
   * Indicates where or not a Quarantine policy is applied
   * when new accounts are created. If enabled all accounts created by
   * any means will have the configured policy applied.
   */
  readonly enable: boolean = true;
  /**
   * The policy to apply to new accounts. This value must exist
   * if the feature is enabled. The name must also match
   * a policy that is defined in the serviceControlPolicy section.
   */
  readonly scpPolicyName: string = 'QuarantineAccounts';
}

/**
 * *{@link OrganizationConfig} / {@link ServiceControlPolicyConfig}*
 *
 * Service control policy configuration
 *
 * @example
 * ```
 * serviceControlPolicies:
 *   - name: QuarantineAccounts
 *     description: Quarantine accounts
 *     policy: path/to/policy.json
 *     type: customerManaged
 *     deploymentTargets:
 *       organizationalUnits: []
 * ```
 */
export abstract class ServiceControlPolicyConfig
implements t.TypeOf<typeof OrganizationConfigTypes.serviceControlPolicyConfig> {
  /**
   * The friendly name to assign to the policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: string = '';
  /**
   * A description to assign to the policy.
   */
  readonly description: string = '';
  /**
   * Service control definition json file. This file must be present in config repository
   */
  readonly policy: string = '';
  /**
   * Kind of service control policy
   */
  readonly type: string = 'customerManaged';
  /**
   * Service control policy deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * Service control policy strategy.
   * https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_strategies.html
   */
  readonly strategy: string = 'deny-list';
}

/**
 * *{@link OrganizationConfig} / {@link TaggingPolicyConfig}*
 *
 * Organizations tag policy.
 *
 * Tag policies help you standardize tags on all tagged resources across your organization.
 * You can use tag policies to define tag keys (including how they should be capitalized) and their allowed values.
 *
 * @example
 * ```
 * taggingPolicies:
 *   - name: TagPolicy
 *     description: Organization Tagging Policy
 *     policy: tagging-policies/org-tag-policy.json
 *     deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export abstract class TaggingPolicyConfig implements t.TypeOf<typeof OrganizationConfigTypes.tagPolicyConfig> {
  /**
   * The friendly name to assign to the policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: string = '';
  /**
   * A description to assign to the policy.
   */
  readonly description: string = '';
  /**
   * Tagging policy definition json file. This file must be present in config repository
   */
  readonly policy: string = '';
  /**
   * Tagging policy deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
 * *{@link OrganizationConfig} / {@link BackupPolicyConfig}*
 *
 * Organization backup policy
 *
 * Backup policies enable you to deploy organization-wide backup plans to help ensure compliance across your organization's accounts.
 * Using policies helps ensure consistency in how you implement your backup plans
 *
 * @example
 * ```
 * backupPolicies:
 *   - name: BackupPolicy
 *     description: Organization Backup Policy
 *     policy: backup-policies/org-backup-policies.json
 *     deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export abstract class BackupPolicyConfig implements t.TypeOf<typeof OrganizationConfigTypes.backupPolicyConfig> {
  /**
   * The friendly name to assign to the policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: string = '';
  /**
   * A description to assign to the policy.
   */
  readonly description: string = '';
  /**
   * Backup policy definition json file. This file must be present in config repository
   */
  readonly policy: string = '';
  /**
   * Backup policy deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export type OrganizationConfigType = t.TypeOf<typeof OrganizationConfigTypes.organizationConfig>;
/**
 * Organization configuration
 */
export class OrganizationConfig implements t.TypeOf<typeof OrganizationConfigTypes.organizationConfig> {
  /**
   * A name for the organization config file in config repository
   *
   * @default organization-config.yaml
   */
  static readonly FILENAME = 'organization-config.yaml';

  /**
   * Indicates whether AWS Organization enabled.
   *
   */
  readonly enable = true;

  /**
   * A Record of Organizational Unit configurations
   *
   * @see OrganizationalUnitConfig
   *
   * To create Security and Infrastructure OU in root , you need to provide following values for this parameter.
   * Nested OU's start at root and configure all of the ou's in the path
   *
   * @example
   * ```
   * organizationalUnits:
   *   - name: Security
   *   - name: Infrastructure
   *   - name: Sandbox
   *   - name: Sandbox/Pipeline
   *   - name: Sandbox/Development
   *   - name: Sandbox/Development/Application1
   * ```
   */
  readonly organizationalUnits: OrganizationalUnitConfig[] = [
    {
      name: 'Security',
      ignore: undefined,
    },
    {
      name: 'Infrastructure',
      ignore: undefined,
    },
  ];

  /**
   * Optionally provide a list of Organizational Unit IDs to bypass the usage of the
   * AWS Organizations Client lookup. This is not a readonly member since we
   * will initialize it with values if it is not provided
   */
  public organizationalUnitIds: OrganizationalUnitIdConfig[] | undefined = undefined;

  /**
   * A record of Quarantine New Accounts configuration
   * @see QuarantineNewAccountsConfig
   */
  readonly quarantineNewAccounts: QuarantineNewAccountsConfig | undefined = undefined;

  /**
   * A Record of Service Control Policy configurations
   *
   * @see ServiceControlPolicyConfig
   *
   * To create service control policy named DenyDeleteVpcFlowLogs from service-control-policies/deny-delete-vpc-flow-logs.json file in config repository, you need to provide following values for this parameter.
   *
   * @example
   * ```
   * serviceControlPolicies:
   *   - name: DenyDeleteVpcFlowLogs
   *     description: >
   *       This SCP prevents users or roles in any affected account from deleting
   *       Amazon Elastic Compute Cloud (Amazon EC2) flow logs or CloudWatch log
   *       groups or log streams.
   *     policy: service-control-policies/deny-delete-vpc-flow-logs.json
   *     type: customerManaged
   *     strategy: deny-list # defines SCP strategy - deny-list or allow-list. See https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_strategies.html
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Security
   * ```
   */
  readonly serviceControlPolicies: ServiceControlPolicyConfig[] = [];

  /**
   * A Record of Tagging Policy configurations
   *
   * @see TaggingPolicyConfig
   *
   * To create tagging policy named TagPolicy from tagging-policies/org-tag-policy.json file in config repository, you need to provide following values for this parameter.
   *
   * @example
   * ```
   * taggingPolicies:
   *   - name: TagPolicy
   *     description: Organization Tagging Policy
   *     policy: tagging-policies/org-tag-policy.json
   *     deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   */
  readonly taggingPolicies: TaggingPolicyConfig[] = [];

  /**
   * A Record of Backup Policy configurations
   *
   * @see BackupPolicyConfig
   *
   * To create backup policy named BackupPolicy from backup-policies/org-backup-policies.json file in config repository, you need to provide following values for this parameter.
   *
   * @example
   * ```
   * backupPolicies:
   *   - name: BackupPolicy
   *     description: Organization Backup Policy
   *     policy: backup-policies/org-backup-policies.json
   *     deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   */
  readonly backupPolicies: BackupPolicyConfig[] = [];

  /**
   *
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(values?: t.TypeOf<typeof OrganizationConfigTypes.organizationConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Load from config file content
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string): OrganizationConfig {
    const buffer = fs.readFileSync(path.join(dir, OrganizationConfig.FILENAME), 'utf8');
    const values = t.parse(OrganizationConfigTypes.organizationConfig, yaml.load(buffer));
    return new OrganizationConfig(values);
  }

  /**
   * Load from string content
   * @param partition
   */
  public async loadOrganizationalUnitIds(partition: string): Promise<void> {
    if (!this.enable) {
      // do nothing
      return;
    } else {
      this.organizationalUnitIds = [];
    }
    if (this.organizationalUnitIds?.length == 0) {
      let organizationsClient: AWS.Organizations;
      if (partition === 'aws-us-gov') {
        organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
      } else if (partition === 'aws-cn') {
        organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1' });
      } else {
        organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
      }

      let rootId = '';

      let listRootsNextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.listRoots({ NextToken: listRootsNextToken }).promise(),
        );
        for (const root of page.Roots ?? []) {
          if (root.Name === 'Root' && root.Id && root.Arn) {
            this.organizationalUnitIds?.push({ name: root.Name, id: root.Id, arn: root.Arn });
            rootId = root.Id;
          }
        }
        listRootsNextToken = page.NextToken;
      } while (listRootsNextToken);

      for (const item of this.organizationalUnits) {
        let parentId = rootId;
        let parentName = '';

        const parentPath = this.getPath(item.name);
        for (const parent of parentPath.split('/')) {
          if (parent) {
            let ouForParentNextToken: string | undefined = undefined;
            do {
              const page = await throttlingBackOff(() =>
                organizationsClient
                  .listOrganizationalUnitsForParent({ ParentId: parentId, NextToken: ouForParentNextToken })
                  .promise(),
              );
              for (const ou of page.OrganizationalUnits ?? []) {
                if (ou.Name === parent && ou.Id) {
                  parentId = ou.Id;
                  parentName = ou.Name;
                }
              }
              ouForParentNextToken = page.NextToken;
            } while (ouForParentNextToken);
          }
        }

        let nextToken: string | undefined = undefined;
        do {
          const page = await throttlingBackOff(() =>
            organizationsClient
              .listOrganizationalUnitsForParent({ ParentId: parentId, NextToken: nextToken })
              .promise(),
          );
          for (const ou of page.OrganizationalUnits ?? []) {
            const ouName = this.getOuName(item.name);
            const ouParent = this.getParentOuName(item.name);
            if (ou.Name === ouName && ouParent === parentName && ou.Id && ou.Arn) {
              this.organizationalUnitIds?.push({ name: item.name, id: ou.Id, arn: ou.Arn });
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);
      }
    }
  }

  public getOrganizationalUnitId(name: string): string {
    if (!this.enable) {
      // do nothing
    } else {
      const ou = this.organizationalUnitIds?.find((item) => item.name === name);
      if (ou) {
        return ou.id;
      }
    }
    console.error("Organizations not enabled or OU doesn't exist");
    throw new Error('configuration validation failed.');
  }

  public getOrganizationalUnitArn(name: string): string {
    if (!this.enable) {
      // do nothing
    } else {
      const ou = this.organizationalUnitIds?.find((item) => item.name === name);
      if (ou) {
        return ou.arn;
      }
    }
    console.error("Organizations not enabled or OU doesn't exist");
    throw new Error('configuration validation failed.');
  }

  public isIgnored(name: string): boolean {
    if (!this.enable) {
      return false;
    }
    const ou = this.organizationalUnits?.find((item) => item.name === name);
    if (ou?.ignore) {
      return true;
    }
    return false;
  }

  public getPath(name: string): string {
    //get the parent path
    const pathIndex = name.lastIndexOf('/');
    const ouPath = name.slice(0, pathIndex + 1).slice(0, -1);
    if (ouPath === '') {
      return '/';
    }
    return '/' + ouPath;
  }

  public getOuName(name: string): string {
    const result = name.split('/').pop();
    if (result === undefined) {
      return name;
    }
    return result;
  }

  public getParentOuName(name: string): string {
    const parentOuPath = this.getPath(name);
    const result = parentOuPath.split('/').pop();
    if (result === undefined) {
      return '/';
    }
    return result;
  }
}
