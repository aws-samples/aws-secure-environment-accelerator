import * as org from 'aws-sdk/clients/organizations';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { OrganizationalUnitConfig, ScpConfig } from '@aws-pbmm/common-lambda/lib/config';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { ConfigurationOrganizationalUnit, LoadConfigurationInput } from './load-configuration-step';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { ArtifactOutputFinder } from '@aws-pbmm/common-outputs/lib/artifacts';

const FULL_AWS_ACCESS_POLICY_NAME = 'FullAWSAccess';

interface AddScpInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  accounts: Account[];
  organizationalUnits: ConfigurationOrganizationalUnit[];
  stackOutputSecretId: string;
}

const s3 = new S3();
const organizations = new Organizations();

export const handler = async (input: AddScpInput) => {
  console.log(`Adding service control policy to organization...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    acceleratorPrefix,
    accounts,
    organizationalUnits,
    configRepositoryName,
    configFilePath,
    configCommitId,
    stackOutputSecretId,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  // Find the SCP artifact output
  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'SCP',
  });
  const scpBucketName = artifactOutput.bucketName;
  const scpBucketPrefix = artifactOutput.keyPrefix;

  // Find policy config
  const globalOptionsConfig = config['global-options'];
  const policyConfigs = globalOptionsConfig.scps;

  // Keep track of Accelerator policy names so we later can detach all non-Accelerator policies
  const acceleratorPolicies = await createPoliciesFromConfiguration({
    acceleratorPrefix,
    scpBucketName,
    scpBucketPrefix,
    policyConfigs,
  });
  const acceleratorPolicyNames = acceleratorPolicies.map(p => p.Name!);

  // Query all the existing policies
  const existingPolicies = await organizations.listPolicies({
    Filter: 'SERVICE_CONTROL_POLICY',
  });

  // Find roots to attach FullAWSAccess
  const roots = await organizations.listRoots();
  const rootIds = roots.map(r => r.Id!);

  // Find Accelerator accounts and OUs to attach FullAWSAccess
  const acceleratorOuIds = organizationalUnits.map(ou => ou.ouId);
  const acceleratorAccountIds = accounts.map(a => a.id);
  const acceleratorTargetIds = [...rootIds, ...acceleratorOuIds, ...acceleratorAccountIds];

  // Detach non-Accelerator policies from Accelerator accounts
  await detachPoliciesFromTargets({
    existingPolicies,
    policyNamesToKeep: acceleratorPolicyNames,
    policyTargetIdsToInclude: acceleratorTargetIds,
  });

  await attachFullAwsAccessPolicyToTargets({
    existingPolicies,
    targetIds: acceleratorTargetIds,
  });

  await attachOrDetachPoliciesToOrganizationalUnits({
    existingPolicies,
    configurationOus: organizationalUnits,
    acceleratorOus: config.getOrganizationalUnits(),
    acceleratorPrefix,
  });

  return {
    status: 'SUCCESS',
  };
};

/**
 * Create or update the policies from the policy configuration.
 *
 * @return Accelerator policies that were created based on the given policy config.
 */
export async function createPoliciesFromConfiguration(props: {
  acceleratorPrefix: string;
  scpBucketName: string;
  scpBucketPrefix: string;
  policyConfigs: ScpConfig[];
}): Promise<org.PolicySummary[]> {
  const { acceleratorPrefix, scpBucketName, scpBucketPrefix, policyConfigs } = props;

  // Find all policies in the organization
  const existingPolicies = await organizations.listPolicies({
    Filter: 'SERVICE_CONTROL_POLICY',
  });

  // Keep track of all the policies created based on the config
  const policies = [];

  // Create or update all policies from the Accelerator config file
  for (const policyConfig of policyConfigs) {
    const policyKey = `${scpBucketPrefix}/${policyConfig.policy}`;
    let policyContent: string | undefined;
    try {
      policyContent = await s3.getObjectBodyAsString({
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
    const acceleratorPolicyName = policyNameToAcceleratorPolicyName({
      acceleratorPrefix,
      policyName: policyConfig.name,
    });

    const existingPolicy = existingPolicies.find(p => p.Name === acceleratorPolicyName);
    if (existingPolicy?.AwsManaged) {
      console.log(`Skipping update of AWS Managed Policy "${existingPolicy.Name}"`);
      policies.push(existingPolicy);
    } else if (existingPolicy) {
      console.log(`Updating policy ${acceleratorPolicyName}`);

      const response = await organizations.updatePolicy(
        policyContent,
        policyConfig.description,
        acceleratorPolicyName,
        existingPolicy.Id!,
      );
      policies.push(response.Policy?.PolicySummary!);
    } else {
      console.log(`Creating policy ${acceleratorPolicyName}`);

      const response = await organizations.createPolicy(
        policyContent,
        policyConfig.description,
        acceleratorPolicyName,
        'SERVICE_CONTROL_POLICY',
      );
      policies.push(response.Policy?.PolicySummary!);
    }
  }
  return policies;
}

/**
 * Detach the policies that are not in the given policy names to keep from targets that are in the targets list.
 */
async function detachPoliciesFromTargets(props: {
  existingPolicies: org.PolicySummary[];
  policyNamesToKeep: string[];
  policyTargetIdsToInclude: string[];
}) {
  const { existingPolicies, policyNamesToKeep, policyTargetIdsToInclude } = props;

  // Remove non-Accelerator policies from Accelerator targets
  for (const policy of existingPolicies) {
    const policyName = policy.Name!;
    // Do **NOT** detach FullAWSAccess and do not detach Accelerator policy names
    if (policyName === FULL_AWS_ACCESS_POLICY_NAME || policyNamesToKeep.includes(policyName)) {
      continue;
    }

    // Find targets of this policy
    const policyId = policy.Id!;
    const policyTargets = await organizations.listTargetsForPolicy({
      PolicyId: policyId,
    });

    // Detach from existing targets
    for (const target of policyTargets) {
      const targetId = target.TargetId!;
      if (!policyTargetIdsToInclude.includes(targetId)) {
        console.log(`Skipping detachment of Accelerator policy ${policyName} from target ${targetId} ${target.Name}`);
        continue;
      }

      console.log(`Detaching policy ${policyName} from target ${targetId} ${target.Name}`);
      await organizations.detachPolicy(policyId, targetId);
    }
  }
}

/**
 * Attach the FullAWSAccess policy to the given targets.
 */
async function attachFullAwsAccessPolicyToTargets(props: {
  existingPolicies: org.PolicySummary[];
  targetIds: string[];
}) {
  const { existingPolicies, targetIds } = props;

  // Find the full access policy
  const fullAccessPolicy = existingPolicies.find(p => p.Name === FULL_AWS_ACCESS_POLICY_NAME);
  if (!fullAccessPolicy) {
    console.warn(`Cannot find policy with name ${FULL_AWS_ACCESS_POLICY_NAME}`);
    return;
  }

  const fullAccessPolicyId = fullAccessPolicy.Id!;
  const fullAccessPolicyTargets = await organizations.listTargetsForPolicy({
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
    await organizations.attachPolicy(fullAccessPolicyId, targetId);
  }
}

/**
 * Attach new or detach removed policies based on the organizational unit configuration.
 */
async function attachOrDetachPoliciesToOrganizationalUnits(props: {
  existingPolicies: org.PolicySummary[];
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
      policyNameToAcceleratorPolicyName({ acceleratorPrefix, policyName }),
    );
    if (ouPolicyNames.length > 4) {
      console.warn(`Maximum allowed SCP per OU is 5. Limit exceeded for OU ${ouKey}`);
      continue;
    }

    // Find targets for this policy
    const policyTargets = await organizations.listPoliciesForTarget({
      Filter: 'SERVICE_CONTROL_POLICY',
      TargetId: organizationalUnit.ouId,
    });

    // Detach removed policies
    for (const policyTarget of policyTargets) {
      const policyTargetName = policyTarget.Name!;
      if (!ouPolicyNames.includes(policyTargetName) && policyTargetName !== FULL_AWS_ACCESS_POLICY_NAME) {
        console.log(`Detaching ${policyTargetName} from OU ${ouKey}`);
        await organizations.detachPolicy(policyTarget.Id!, organizationalUnit.ouId);
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
      await organizations.attachPolicy(policy.Id!, organizationalUnit.ouId);
    }
  }
}

/**
 * Convert policy name to Accelerator policy name. If the policy name is the FullAWSAccess policy name, then we keep
 * the name as is. If the policy name does not have the Accelerator prefix, then we add the prefix.
 *
 * @return Policy name with Accelerator prefix.
 */
export function policyNameToAcceleratorPolicyName(props: { policyName: string; acceleratorPrefix: string }) {
  const { policyName, acceleratorPrefix } = props;
  if (policyName === FULL_AWS_ACCESS_POLICY_NAME || policyName.startsWith(acceleratorPrefix)) {
    return policyName;
  }
  return `${acceleratorPrefix}${policyName}`;
}
