import * as r53 from 'aws-sdk/clients/route53';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { getStackJsonOutput, StackOutput, ResolversOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Route53 } from '@aws-accelerator/common/src/aws/route53';
import { Route53Resolver } from '@aws-accelerator/common/src/aws/r53resolver';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { throttlingBackOff } from '@aws-accelerator/common/src/aws/backoff';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { loadOutputs } from './utils/load-outputs';
import { loadAccounts } from './utils/load-accounts';

interface AssociateHostedZonesInput extends LoadConfigurationInput {
  assumeRoleName: string;
  outputTableName: string;
  parametersTableName: string;
}

type ResolversOutputs = ResolversOutput[];

/**
 * Auxiliary interface that represents a hosted zone in a specific account and VPC.
 */
interface AccountHostedZone {
  accountKey: string;
  accountId: string;
  hostedZoneId: string;
  associatedVpcIds: string[];
}

/**
 * Auxiliary interface that represents a resolver rule in a specific account and VPC.
 */
interface AccountRule {
  accountKey: string;
  accountId: string;
  ruleId: string;
}

// Hosted zone ID is in the form of `/hostedzone/Z0181099DGX53XMU1D7S`
const hostedZoneIdRegex = /\/hostedzone\/([\d\w]+)/;

const dynamodb = new DynamoDB();
const sts = new STS();

export const handler = async (input: AssociateHostedZonesInput) => {
  console.log(`Associating Hosted Zones with VPC...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configRepositoryName,
    assumeRoleName,
    configCommitId,
    configFilePath,
    outputTableName,
    parametersTableName,
  } = input;

  const accounts = await loadAccounts(parametersTableName, dynamodb);

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const outputs = await loadOutputs(outputTableName, dynamodb);

  // get the private zones from global-options
  const globalOptionsConfig = config['global-options'];
  const privateZones = globalOptionsConfig.zones.names.private;

  const accountHostedZones: AccountHostedZone[] = [];
  const accountRules: AccountRule[] = [];
  for (const account of accounts) {
    console.log(`Loading hosted zones for account ${account.key}`);

    // TODO Store all hosted zones in outputs and load those outputs here
    // Find all hosted zones in Route53
    const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
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
        if (!isPrivateHostedZone(privateZones, hostedZone)) {
          continue;
        }

        // Load already associated VPCs
        const hostedZoneWithVpcs = await route53.getHostedZone(hostedZone.Id);
        const associatedVpcs = hostedZoneWithVpcs.VPCs || [];
        const associatedVpcIds = associatedVpcs.map(vpc => vpc.VPCId!);

        const match = hostedZone.Id.match(hostedZoneIdRegex);
        if (!match) {
          console.warn(`Cannot extract hosted zone ID from ${hostedZone.Id}`);
          continue;
        }

        const privateHostedZoneId = match[1];
        accountHostedZones.push({
          accountKey: account.key,
          accountId: account.id,
          hostedZoneId: privateHostedZoneId,
          associatedVpcIds,
        });
      }
    } while (nextMarker);

    // Find all resolver rules in outputs
    const resolversOutputs: ResolversOutputs[] = getStackJsonOutput(outputs, {
      accountKey: account.key,
      outputType: 'GlobalOptionsOutput',
    });

    const resolverOutputs = resolversOutputs.flatMap(list => list);
    for (const resolverOutput of resolverOutputs) {
      const inboundRuleId = resolverOutput.rules?.inBoundRule;
      if (inboundRuleId) {
        accountRules.push({
          accountKey: account.key,
          accountId: account.id,
          ruleId: inboundRuleId,
        });
      }
      resolverOutput.rules?.onPremRules?.forEach(ruleId =>
        accountRules.push({
          accountKey: account.key,
          accountId: account.id,
          ruleId,
        }),
      );
    }

    // TODO Merge above outputs and this one together
    // Find all MAD resolver rules in outputs
    // tslint:disable-next-line: no-any
    const madRulesOutputs: any = getStackJsonOutput(outputs, {
      accountKey: account.key,
      outputType: 'MadRulesOutput',
    });
    for (const madRulesOutput of madRulesOutputs) {
      accountRules.push({
        accountKey: account.key,
        accountId: account.id,
        ruleId: madRulesOutput.Endpoint,
      });
    }
  }

  console.log('Starting association of private hosted zones with accounts VPC...');

  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!vpcConfig['use-central-endpoints']) {
      // TODO Disassociate hosted zones and resolver rules
      continue;
    }

    const accountId = getAccountId(accounts, accountKey);
    if (!accountId) {
      console.warn(`Cannot find account with accountKey ${accountKey}`);
      continue;
    }

    const vpcName = vpcConfig.name;
    const vpcRegion = vpcConfig.region;
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      region: vpcRegion,
      vpcName,
    });
    if (!vpcOutput) {
      console.warn(`Cannot find VPC "${vpcName}" in outputs`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;

    // TODO Support the use-case that the VPC could have its own interface endpoints

    for (const accountHostedZone of accountHostedZones) {
      if (accountHostedZone.associatedVpcIds.includes(vpcId)) {
        console.log(`VPC ${vpcName} with ID ${vpcId} is already associated to PHZ ${accountHostedZone.hostedZoneId}`);
        continue;
      }

      await associateHostedZone({
        assumeRoleName,
        vpcAccountId: accountId,
        vpcName,
        vpcId,
        vpcRegion,
        hostedZoneAccountId: accountHostedZone.accountId,
        hostedZoneId: accountHostedZone.hostedZoneId,
      });
    }

    for (const accountRule of accountRules) {
      await associateResolverRule({
        assumeRoleName,
        accountId,
        resolverRuleId: accountRule.ruleId,
        vpcId,
        vpcName,
      });
    }
  }

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
    const message = `${e}`;
    if (message.includes('Cannot associate rules with same domain name with same VPC')) {
      // Domain already added; ignore this error and continue
    } else {
      // TODO Handle error
      console.error(`Ignoring error while associating the resolver rule to VPC "${vpcName}"`);
      console.error(message);
    }
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
      console.error(`Ignoring error while associating the hosted zone ${hostedZoneId} to VPC "${vpcName}"`);
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
  // TODO need good logic to validate association with hosted zones, can be deprecated if we move to custom resources
  if (hostedZoned.Name.includes('ca-central-1.amazonaws.com')) {
    return true;
  } else if (hostedZoned.Name.includes('notebook.ca-central-1.sagemaker.aws')) {
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
