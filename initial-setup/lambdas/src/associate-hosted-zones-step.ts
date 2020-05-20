import * as r53 from 'aws-sdk/clients/route53';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { ResolversOutput, VpcOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getStackJsonOutput, StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Route53 } from '@aws-pbmm/common-lambda/lib/aws/route53';
import { Route53Resolver } from '@aws-pbmm/common-lambda/lib/aws/r53resolver';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { throttlingBackOff } from '@aws-pbmm/common-lambda/lib/aws/backoff';

interface AssociateHostedZonesInput extends LoadConfigurationInput {
  accounts: Account[];
  assumeRoleName: string;
  stackOutputSecretId: string;
}

type ResolversOutputs = ResolversOutput[];

/**
 * Auxiliary interface that represents a hosted zone in a specific account and VPC.
 */
interface AccountHostedZone {
  accountKey: string;
  accountId: string;
  vpcId: string;
  vpcName: string;
  hostedZoneId: string;
}

/**
 * Auxiliary interface that represents a resolver rule in a specific account and VPC.
 */
interface AccountRule {
  accountKey: string;
  accountId: string;
  vpcId: string;
  vpcName: string;
  ruleId: string;
}

const sts = new STS();

export const handler = async (input: AssociateHostedZonesInput) => {
  console.log(`Associating Hosted Zones with VPC...`);
  console.log(JSON.stringify(input, null, 2));

  const { configRepositoryName, accounts, assumeRoleName, stackOutputSecretId, configCommitId, configFilePath } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  // get the private zones from global-options
  const globalOptionsConfig = config['global-options'];
  const privateZones = globalOptionsConfig.zones.names.private;

  const accountHostedZones: AccountHostedZone[] = [];
  const accountRules: AccountRule[] = [];
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    const accountId = getAccountId(accounts, accountKey);
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);

    // Find the VPC in the outputs from previous phases
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      console.warn(`Cannot find VPC "${vpcConfig.name}" in outputs`);
      continue;
    }

    // TODO Store all hosted zones in outputs and load those outputs here
    // Find all hosted zones in Route53
    const route53 = new Route53(credentials);
    let listHostedZones;
    let nextMarker;
    do {
      // TODO Use pagination withNextToken function when it supports NextMarker
      listHostedZones = await route53.listHostedZones(undefined, nextMarker);
      nextMarker = listHostedZones.NextMarker;

      const hostedZones = listHostedZones.HostedZones || [];
      // get all private hosted zones
      for (const hostedZone of hostedZones) {
        if (isPrivateHostedZone(privateZones, hostedZone)) {
          const privateHostedZoneId = hostedZone.Id.split('/')[2];
          accountHostedZones.push({
            accountKey,
            accountId,
            vpcName: vpcConfig.name,
            vpcId: vpcOutput.vpcId,
            hostedZoneId: privateHostedZoneId,
          });
        }
      }
    } while (nextMarker);

    // Find all resolver rules in outputs
    const resolversOutputs: ResolversOutputs[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'GlobalOptionsOutput',
    });

    for (const resolversOutput of resolversOutputs) {
      const resolverOutput = resolversOutput.find(o => o.vpcName === vpcConfig.name);
      if (!resolverOutput) {
        console.warn(`No resolver rules found in outputs for VPC name "${vpcConfig.name}"`);
        continue;
      }

      const inboundRuleId = resolverOutput.rules?.inBoundRule;
      if (inboundRuleId) {
        accountRules.push({
          accountKey,
          accountId,
          vpcName: vpcConfig.name,
          vpcId: vpcOutput.vpcId,
          ruleId: inboundRuleId,
        });
      }
      resolverOutput.rules?.onPremRules?.forEach(ruleId =>
        accountRules.push({
          accountKey,
          accountId,
          vpcName: vpcConfig.name,
          vpcId: vpcOutput.vpcId,
          ruleId,
        }),
      );
    }

    // TODO Merge above outputs and this one together
    // Find all MAD resolver rules in outputs
    // tslint:disable-next-line: no-any
    const madRulesOutputs: any = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'MadRulesOutput',
    });
    for (const madRulesOutput of madRulesOutputs) {
      if (!madRulesOutput.Endpoint) {
        console.warn(`No MAD resolver rules found in outputs for VPC name "${vpcConfig.name}"`);
        continue;
      }
      accountRules.push({
        accountKey,
        accountId,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        ruleId: madRulesOutput.Endpoint,
      });
    }
  }

  console.log('Starting association of private hosted zones with accounts VPC...');

  // Store all promises of our requests and await for the result all together
  const associationPromises = [];
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!vpcConfig['use-central-endpoints']) {
      // TODO Disassociate hosted zones and resolver rules
      continue;
    }

    const accountId = getAccountId(accounts, accountKey);
    const vpcName = vpcConfig.name;
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcName);
    if (!vpcOutput) {
      console.warn(`Cannot find VPC "${vpcName}" in outputs`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;
    const vpcRegion = vpcConfig.region;

    // TODO Support the use-case that the VPC could have its own interface endpoints

    for (const accountHostedZone of accountHostedZones) {
      associationPromises.push(
        associateHostedZone({
          assumeRoleName,
          vpcAccountId: accountId,
          vpcName,
          vpcId,
          vpcRegion,
          hostedZoneAccountId: accountHostedZone.accountId,
          hostedZoneId: accountHostedZone.hostedZoneId,
        }),
      );
    }

    for (const accountRule of accountRules) {
      associationPromises.push(
        associateResolverRule({
          assumeRoleName,
          accountId,
          resolverRuleId: accountRule.ruleId,
          vpcId,
          vpcName,
        }),
      );
    }
  }

  // Wait for all hosted zones to be associated
  await Promise.all(associationPromises);

  return {
    status: 'SUCCESS',
    statusReason: 'Associated Hosted Zones and resolver rules with the VPC',
  };
};

async function associateResolverRule(props: {
  assumeRoleName: string;
  accountId: string;
  resolverRuleId: string;
  vpcId: string;
  vpcName?: string;
}) {
  const { assumeRoleName, accountId, resolverRuleId, vpcId, vpcName } = props;

  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
  const r53Resolver = new Route53Resolver(credentials);

  try {
    await throttlingBackOff(() => {
      console.log(`Associating resolver rule ${resolverRuleId} with VPC ${vpcId} ${vpcName}...`);
      return r53Resolver.associateResolverRule(resolverRuleId, vpcId);
    });
  } catch (e) {
    // TODO Handle error
    console.error(`Ignoring error while associating the resolver rule to VPC "${vpcName}"`);
    console.error(e);
  }
}

/**
 * Auxiliary function that associates the given VPC to the given hosted zone. An VPC association authorization is
 * created when the VPC is in a different account than the hosted zone.
 */
async function associateHostedZone(props: {
  assumeRoleName: string;
  vpcAccountId: string;
  vpcName?: string;
  vpcId: string;
  vpcRegion: string;
  hostedZoneAccountId: string;
  hostedZoneId: string;
}) {
  const { assumeRoleName, vpcAccountId, vpcName, vpcId, vpcRegion, hostedZoneAccountId, hostedZoneId } = props;

  const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
  const vpcRoute53 = new Route53(vpcAccountCredentials);

  const hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
  const hostedZoneRoute53 = new Route53(hostedZoneAccountCredentials);

  // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
  if (vpcAccountId !== hostedZoneAccountId) {
    await throttlingBackOff(() => {
      return hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneId, vpcId, vpcRegion);
    });
  }

  // associate VPC with Hosted zones
  try {
    await throttlingBackOff(() => {
      console.log(`Associating hosted zone ${hostedZoneId} with VPC ${vpcId} ${vpcName}...`);
      return vpcRoute53.associateVPCWithHostedZone(hostedZoneId, vpcId, vpcRegion);
    });
  } catch (e) {
    if (e.code === 'ConflictingDomainExists') {
      // Domain already added; ignore this error and continue
    } else {
      // TODO Handle errors
      console.error(e);
    }
  }

  // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
  if (vpcAccountId !== hostedZoneAccountId) {
    await throttlingBackOff(() => {
      return hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneId, vpcId, vpcRegion);
    });
  }
}

/**
 * Returns true if the given hosted zone is in the given private zones or if is an interface or gateway endpoint.
 */
function isPrivateHostedZone(privateZones: string[], hostedZoned: r53.HostedZone): boolean {
  // TODO
  if (hostedZoned.Name.includes('ca-central-1.amazonaws.com')) {
    return true;
  } else {
    for (const privateZone of privateZones) {
      if (hostedZoned.Name.includes(privateZone)) {
        return true;
      }
    }
  }
  return false;
}
