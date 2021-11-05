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

import { Organizations } from '../aws/organizations';
import { S3 } from '../aws/s3';
import { ScpConfig, OrganizationalUnitConfig, ReplacementsConfig, BaseLineType } from '@aws-accelerator/common-config';
import { stringType } from 'aws-sdk/clients/iam';
import { PolicySummary } from 'aws-sdk/clients/organizations';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';
import { additionalReplacements, replaceDefaults } from './../util/common';
import { AccountConfig } from '@aws-accelerator/common-config/src';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export const FULL_AWS_ACCESS_POLICY_NAME = 'FullAWSAccess';

export class ServiceControlPolicy {
  private readonly org: Organizations;
  private readonly s3: S3;
  private readonly acceleratorPrefix: string;
  private readonly acceleratorName: string;
  private readonly region: string;
  private readonly organizationAdminRole: string;
  private readonly replacements?: ReplacementsConfig;

  constructor(props: {
    acceleratorPrefix: stringType;
    acceleratorName: string;
    region: string;
    organizationAdminRole: string;
    replacements?: ReplacementsConfig;
    client?: Organizations;
  }) {
    this.org = props.client || new Organizations();
    this.s3 = new S3();
    this.acceleratorPrefix = props.acceleratorPrefix;
    this.acceleratorName = props.acceleratorName;
    this.region = props.region;
    this.replacements = props.replacements;
    this.organizationAdminRole = props.organizationAdminRole;
  }

  async createOrUpdateQuarantineScp(targetIds?: string[]): Promise<string> {
    const policyName = ServiceControlPolicy.createQuarantineScpName({ acceleratorPrefix: this.acceleratorPrefix });
    const policyContent = ServiceControlPolicy.createQuarantineScpContent({
      acceleratorPrefix: this.acceleratorPrefix,
      organizationAdminRole: this.organizationAdminRole,
    });
    const getPolicyByName = await this.org.getPolicyByName({
      Name: policyName,
      Filter: 'SERVICE_CONTROL_POLICY',
    });
    let policyId = getPolicyByName?.PolicySummary?.Id!;
    if (policyId) {
      console.log(`Updating policy ${policyName}`);
      if (getPolicyByName?.Content !== policyContent) {
        await this.org.updatePolicy({
          policyId,
          content: policyContent,
        });
      }
    } else {
      console.log(`Creating policy ${policyName}`);
      const response = await this.org.createPolicy({
        type: 'SERVICE_CONTROL_POLICY',
        name: policyName,
        description: `${this.acceleratorPrefix}Quarantine policy - Apply to ACCOUNTS that need to be quarantined`,
        content: policyContent,
      });
      policyId = response.Policy?.PolicySummary?.Id!;
    }
    for (const targetId of targetIds || []) {
      console.log(`Attaching SCP "${policyName}" to account "${targetId}"`);
      await this.org.attachPolicy(policyId, targetId);
    }
    return policyId;
  }

  /**
   * Create or update the policies from the policy configuration.
   *
   * @return Accelerator policies that were created based on the given policy config.
   */
  async createPoliciesFromConfiguration(props: {
    scpBucketName: string;
    scpBucketPrefix: string;
    policyConfigs: ScpConfig[];
  }): Promise<PolicySummary[]> {
    const { scpBucketName, scpBucketPrefix, policyConfigs } = props;

    // Find all policies in the organization
    const existingPolicies = await this.listScps();

    // Keep track of all the policies created based on the config
    const policies = [];

    // Create or update all policies from the Accelerator config file
    for (const policyConfig of policyConfigs) {
      const policyKey = `${scpBucketPrefix}/${policyConfig.policy}`;
      let policyContent: string | undefined;
      try {
        policyContent = await this.s3.getObjectBodyAsString({
          Bucket: scpBucketName,
          Key: policyKey,
        });
      } catch (e) {
        if (e.message === 'Access Denied') {
          console.error(`Access denied to the SCP file at "s3://${scpBucketName}/${policyKey}"`);
        }
        throw e;
      }

      // policyContent = policyContent.replace(/\${ORG_ADMIN_ROLE}/g, organizationAdminRole);

      // Minify the SCP content
      policyContent = JSON.stringify(JSON.parse(policyContent));
      policyContent = replaceDefaults({
        acceleratorName: this.acceleratorName,
        acceleratorPrefix: this.acceleratorPrefix,
        additionalReplacements: additionalReplacements(this.replacements!),
        config: policyContent,
        region: this.region,
        orgAdminRole: this.organizationAdminRole,
      });

      // Prefix the Accelerator prefix if necessary
      const acceleratorPolicyName = ServiceControlPolicy.policyNameToAcceleratorPolicyName({
        acceleratorPrefix: this.acceleratorPrefix,
        policyName: policyConfig.name,
      });

      const existingPolicy = existingPolicies.find(p => p.Name === acceleratorPolicyName);
      if (existingPolicy?.AwsManaged) {
        console.log(`Skipping update of AWS Managed Policy "${existingPolicy.Name}"`);
        policies.push(existingPolicy);
      } else if (existingPolicy) {
        console.log(`Updating policy ${acceleratorPolicyName}`);

        const response = await this.org.updatePolicy({
          policyId: existingPolicy.Id!,
          content: policyContent,
        });
        policies.push(response.Policy?.PolicySummary!);
      } else {
        console.log(`Creating policy ${acceleratorPolicyName}`);

        const response = await this.org.createPolicy({
          type: 'SERVICE_CONTROL_POLICY',
          name: acceleratorPolicyName,
          description: policyConfig.description,
          content: policyContent,
        });
        policies.push(response.Policy?.PolicySummary!);
      }
    }
    return policies;
  }

  /**
   * Detach the policies that are not in the given policy names to keep from targets that are in the targets list.
   */
  async detachPoliciesFromTargets(props: {
    policyNamesToKeep: string[];
    policyTargetIdsToInclude: string[];
    baseline?: BaseLineType;
  }) {
    const { policyNamesToKeep, policyTargetIdsToInclude, baseline } = props;

    // Remove non-Accelerator policies from Accelerator targets

    for (const target of policyTargetIdsToInclude) {
      const existingPolicies = await this.org.listPoliciesForTarget({
        TargetId: target,
        Filter: 'SERVICE_CONTROL_POLICY',
      });
      for (const policy of existingPolicies) {
        const policyName = policy.Name!;
        // Do **NOT** detach FullAWSAccess and do not detach Accelerator policy names
        if (
          policyName === FULL_AWS_ACCESS_POLICY_NAME ||
          policyNamesToKeep.includes(policyName) ||
          (policyName.startsWith('aws-guardrails-') && baseline === 'CONTROL_TOWER')
        ) {
          continue;
        }
        await this.org.detachPolicy(policy.Id!, target);
      }
    }
  }

  /**
   * Attach the FullAWSAccess policy to the given targets.
   */
  async attachFullAwsAccessPolicyToTargets(props: { existingPolicies: PolicySummary[]; targetIds: string[] }) {
    const { existingPolicies, targetIds } = props;

    // Find the full access policy
    const fullAccessPolicy = existingPolicies.find(p => p.Name === FULL_AWS_ACCESS_POLICY_NAME);
    if (!fullAccessPolicy) {
      console.warn(`Cannot find policy with name ${FULL_AWS_ACCESS_POLICY_NAME}`);
      return;
    }

    const fullAccessPolicyId = fullAccessPolicy.Id!;
    const fullAccessPolicyTargets = await this.org.listTargetsForPolicy({
      PolicyId: fullAccessPolicyId,
    });

    // Attach FullAWSAccess to all roots, OUs in Accelerator and accounts in Accelerator
    for (const targetId of targetIds) {
      const target = fullAccessPolicyTargets.find(t => t.TargetId === targetId);
      if (target) {
        console.log(`Skipping attachment of ${fullAccessPolicy.Name} to already attached target ${target.Name}`);
        continue;
      }

      console.log(`Attaching policy ${fullAccessPolicy.Name} attaching to target ${targetId}`);
      await this.org.attachPolicy(fullAccessPolicyId, targetId);
    }
  }

  /**
   * Attach new or detach removed policies based on the organizational unit configuration.
   */
  async attachOrDetachPoliciesToOrganizationalUnits(props: {
    existingPolicies: PolicySummary[];
    configurationOus: OrganizationalUnit[];
    acceleratorOus: [string, OrganizationalUnitConfig][];
    acceleratorPrefix: string;
    baseline?: BaseLineType;
  }) {
    const { existingPolicies, configurationOus, acceleratorOus, acceleratorPrefix, baseline } = props;

    // Attach Accelerator SCPs to OUs
    for (const [ouKey, ouConfig] of acceleratorOus) {
      const organizationalUnit = configurationOus.find(ou => ou.ouPath === ouKey);
      if (!organizationalUnit) {
        console.warn(`Cannot find OU configuration with key "${ouKey}"`);
        continue;
      }
      const ouPolicyNames = ouConfig.scps.map(policyName =>
        ServiceControlPolicy.policyNameToAcceleratorPolicyName({ acceleratorPrefix, policyName }),
      );
      if (ouPolicyNames.length > 4) {
        console.warn(`Maximum allowed SCP per OU is 5. Limit exceeded for OU ${ouKey}`);
        continue;
      }

      // Find targets for this policy
      const policyTargets = await this.org.listPoliciesForTarget({
        Filter: 'SERVICE_CONTROL_POLICY',
        TargetId: organizationalUnit.ouId,
      });

      // Detach removed policies
      for (const policyTarget of policyTargets) {
        const policyTargetName = policyTarget.Name!;
        if (policyTargetName.startsWith('aws-guardrails-') && baseline === 'CONTROL_TOWER') {
          continue;
        }
        if (!ouPolicyNames.includes(policyTargetName) && policyTargetName !== FULL_AWS_ACCESS_POLICY_NAME) {
          console.log(`Detaching ${policyTargetName} from OU ${ouKey}`);
          await this.org.detachPolicy(policyTarget.Id!, organizationalUnit.ouId);
        }
      }

      // Attach new policies
      for (const ouPolicyName of ouPolicyNames) {
        const policy = existingPolicies.find(p => p.Name === ouPolicyName);
        if (!policy) {
          throw new Error(`Cannot find policy with name "${ouPolicyName}"`);
          continue;
        }

        const policyTarget = policyTargets.find(x => x.Name === ouPolicyName);
        if (policyTarget) {
          console.log(`Skipping attachment of ${ouPolicyName} to already attached OU ${ouKey}`);
          continue;
        }

        console.log(`Attaching ${ouPolicyName} to OU ${ouKey}`);
        await this.org.attachPolicy(policy.Id!, organizationalUnit.ouId);
      }
    }
  }

  /**
   * Attach new or detach removed policies based on the account configuration.
   */
  async attachOrDetachPoliciesToAccounts(props: {
    existingPolicies: PolicySummary[];
    configurationAccounts: Account[];
    accountConfigs: [string, AccountConfig][];
    acceleratorPrefix: string;
  }) {
    const { existingPolicies, configurationAccounts, accountConfigs, acceleratorPrefix } = props;

    for (const [accountKey, accountConfig] of accountConfigs) {
      const Account = configurationAccounts.find(Account => Account.key === accountKey);
      /**
       * Check if scps key is set on account. If not, ignore as SCPs are being managed in the outside the installer.
       */
      if (accountConfig.scps == null) {
        continue;
      }

      // Attach Accelerator SCPs to Accounts
      if (!Account) {
        console.warn(`Cannot find Account configuration with key "${accountKey}"`);
        continue;
      }

      const accountPolicyNames = accountConfig.scps.map(policyName =>
        ServiceControlPolicy.policyNameToAcceleratorPolicyName({ acceleratorPrefix, policyName }),
      );

      if (accountPolicyNames.length > 4) {
        console.warn(`Maximum allowed SCP per Account is 5. Limit exceeded for Account ${accountKey}`);
        continue;
      }

      // Find targets for this policy
      const policyTargets = await this.org.listPoliciesForTarget({
        Filter: 'SERVICE_CONTROL_POLICY',
        TargetId: Account.id,
      });

      // Detach removed policies
      for (const policyTarget of policyTargets) {
        const policyTargetName = policyTarget.Name!;
        if (!accountPolicyNames.includes(policyTargetName) && policyTargetName !== FULL_AWS_ACCESS_POLICY_NAME) {
          console.log(`Detaching ${policyTargetName} from Account ${accountKey}`);
          await this.org.detachPolicy(policyTarget.Id!, Account.id);
        }
      }

      // Attach new policies
      for (const accountPolicyName of accountPolicyNames) {
        const policy = existingPolicies.find(p => p.Name === accountPolicyName);
        if (!policy) {
          throw new Error(`Cannot find policy with name "${accountPolicyName}"`);
          continue;
        }

        const policyTarget = policyTargets.find(x => x.Name === accountPolicyName);
        if (policyTarget) {
          console.log(`Skipping attachment of ${accountPolicyName} to already attached Account ${accountKey}`);
          continue;
        }

        console.log(`Attaching ${accountPolicyName} to Account ${accountKey}`);
        await this.org.attachPolicy(policy.Id!, Account.id);
      }
    }
  }

  static createQuarantineScpContent(props: { acceleratorPrefix: string; organizationAdminRole: string }) {
    return JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyAllAWSServicesExceptBreakglassRoles',
          Effect: 'Deny',
          Action: '*',
          Resource: '*',
          Condition: {
            ArnNotLike: {
              'aws:PrincipalARN': [
                `arn:aws:iam::*:role/${props.organizationAdminRole || 'AWSCloudFormationStackSetExecutionRole'}`,
                `arn:aws:iam::*:role/${props.acceleratorPrefix}*`,
                'arn:aws:iam::*:role/aws*',
              ],
            },
          },
        },
      ],
    });
  }

  static createQuarantineScpName(props: { acceleratorPrefix: string }) {
    return `${props.acceleratorPrefix}Quarantine-New-Object`;
  }

  /**
   * Convert policy name to Accelerator policy name. If the policy name is the FullAWSAccess policy name, then we keep
   * the name as is. If the policy name does not have the Accelerator prefix, then we add the prefix.
   *
   * @return Policy name with Accelerator prefix.
   */
  static policyNameToAcceleratorPolicyName(props: { policyName: string; acceleratorPrefix: string }) {
    const { policyName, acceleratorPrefix } = props;
    if (policyName === FULL_AWS_ACCESS_POLICY_NAME || policyName.startsWith(acceleratorPrefix)) {
      return policyName;
    }
    return `${acceleratorPrefix}${policyName}`;
  }

  async organizationRoots(): Promise<string[]> {
    const roots = await this.org.listRoots();
    return roots.map(r => r.Id!);
  }

  async listScps(): Promise<PolicySummary[]> {
    const policies = await this.org.listPolicies({
      Filter: 'SERVICE_CONTROL_POLICY',
    });
    return policies;
  }
}
