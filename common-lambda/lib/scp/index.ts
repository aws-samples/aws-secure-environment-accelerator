import { Organizations } from '../aws/organizations';
import { S3 } from '../aws/s3';
import { ScpConfig, OrganizationalUnitConfig } from '../config';
import { stringType } from 'aws-sdk/clients/iam';
import { PolicySummary } from 'aws-sdk/clients/organizations';

export const FULL_AWS_ACCESS_POLICY_NAME = 'FullAWSAccess';

interface ConfigurationOrganizationalUnit {
  ouId: string;
  ouKey: string;
  ouName: string;
}

export class ServiceControlPolicy {
  private readonly org: Organizations;
  private readonly s3: S3;
  private readonly acceleratorPrefix: string;

  constructor(acceleratorPrefix: stringType, client?: Organizations) {
    this.org = client || new Organizations();
    this.s3 = new S3();
    this.acceleratorPrefix = acceleratorPrefix;
  }

  async createOrUpdateQuarantineScp(targetIds?: string[]): Promise<string> {
    const policyName = ServiceControlPolicy.createQuarantineScpName({ acceleratorPrefix: this.acceleratorPrefix });
    const policyContent = ServiceControlPolicy.createQuarantineScpContent({
      acceleratorPrefix: this.acceleratorPrefix,
    });
    const getPolicyByName = await this.org.getPolicyByName({
      Name: policyName,
      Filter: 'SERVICE_CONTROL_POLICY',
    });
    let policyId = getPolicyByName?.PolicySummary?.Id;
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
    acceleratorPrefix: string;
    scpBucketName: string;
    scpBucketPrefix: string;
    policyConfigs: ScpConfig[];
  }): Promise<PolicySummary[]> {
    const { acceleratorPrefix, scpBucketName, scpBucketPrefix, policyConfigs } = props;

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

      // Minify the SCP content
      policyContent = JSON.stringify(JSON.parse(policyContent));

      // Prefix the Accelerator prefix if necessary
      const acceleratorPolicyName = ServiceControlPolicy.policyNameToAcceleratorPolicyName({
        acceleratorPrefix,
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
  async detachPoliciesFromTargets(props: { policyNamesToKeep: string[]; policyTargetIdsToInclude: string[] }) {
    const { policyNamesToKeep, policyTargetIdsToInclude } = props;

    // Remove non-Accelerator policies from Accelerator targets

    for (const target of policyTargetIdsToInclude) {
      const existingPolicies = await this.org.listPoliciesForTarget({
        TargetId: target,
        Filter: 'SERVICE_CONTROL_POLICY',
      });
      for (const policy of existingPolicies) {
        const policyName = policy.Name!;
        // Do **NOT** detach FullAWSAccess and do not detach Accelerator policy names
        if (policyName === FULL_AWS_ACCESS_POLICY_NAME || policyNamesToKeep.includes(policyName)) {
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
    configurationOus: ConfigurationOrganizationalUnit[];
    acceleratorOus: [string, OrganizationalUnitConfig][];
    acceleratorPrefix: string;
  }) {
    const { existingPolicies, configurationOus, acceleratorOus, acceleratorPrefix } = props;

    // Attach Accelerator SCPs to OUs
    for (const [ouKey, ouConfig] of acceleratorOus) {
      const organizationalUnit = configurationOus.find(ou => ou.ouKey === ouKey);
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
        if (!ouPolicyNames.includes(policyTargetName) && policyTargetName !== FULL_AWS_ACCESS_POLICY_NAME) {
          console.log(`Detaching ${policyTargetName} from OU ${ouKey}`);
          await this.org.detachPolicy(policyTarget.Id!, organizationalUnit.ouId);
        }
      }

      // Attach new policies
      for (const ouPolicyName of ouPolicyNames) {
        const policy = existingPolicies.find(p => p.Name === ouPolicyName);
        if (!policy) {
          console.warn(`Cannot find policy with name "${ouPolicyName}"`);
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

  static createQuarantineScpContent(props: { acceleratorPrefix: string }) {
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
                'arn:aws:iam::*:role/AWSCloudFormationStackSetExecutionRole',
                `arn:aws:iam::*:role/${props.acceleratorPrefix}*`,
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
