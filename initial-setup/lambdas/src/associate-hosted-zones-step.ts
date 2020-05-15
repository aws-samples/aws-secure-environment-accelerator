import * as r53 from 'aws-sdk/clients/route53';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from './load-accounts-step';
import { getAccountId } from '../../templates/src/utils/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getStackJsonOutput, StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { VpcOutput } from '../../templates/src/deployments/vpc';
import { ResolversOutput } from '../../templates/src/apps/phase-2';
import { Route53 } from '@aws-pbmm/common-lambda/lib/aws/route53';
import { Route53Resolver } from '@aws-pbmm/common-lambda/lib/aws/r53resolver';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from './load-configuration-step';

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

  const secrets = new SecretsManager();

  // Retrive Configuration from Code Commit with specific commitId
  const configString = await loadAcceleratorConfig(configRepositoryName, configFilePath, configCommitId);
  const config = AcceleratorConfig.fromString(configString);

  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  // get the private zones from global-options
  const globalOptionsConfig = config['global-options'];
  const privateZones = globalOptionsConfig.zones.names.private;
  console.log(`private zones from global config - ${privateZones}`);

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
        console.warn(`No Resolver Rules found in outputs for VPC name "${vpcConfig.name}"`);
        continue;
      }

      // example arn: arn:aws:route53resolver:ca-central-1:421338879487:resolver-rule/rslvr-rr-1950974c876a4201b
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
  }

  console.log('Starting association of private hosted zones with accounts VPC...');
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!vpcConfig['use-central-endpoints']) {
      // TODO Disassociate hosted zones and resolver rules
      continue;
    }

    console.log(`use-central-endpoints is true for account with key - ${accountKey} ${vpcConfig.name}`);

    const accountId = getAccountId(accounts, accountKey);
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      console.warn(`Cannot find VPC "${vpcConfig.name}" in outputs`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;
    const vpcRegion = vpcConfig.region;

    // TODO Support the use-case that the VPC could have its own interface endpoints

    const associateHostedZonePromises = [];
    for (const accountHostedZone of accountHostedZones) {
      const associateHostedZonePromise = associateHostedZone({
        assumeRoleName,
        vpcAccountId: accountId,
        vpcName: vpcConfig.name,
        vpcId,
        vpcRegion,
        hostedZoneAccountId: accountHostedZone.accountId,
        hostedZoneId: accountHostedZone.hostedZoneId,
      }).catch(e => {
        // TODO Make this safer by adding a retry
        console.error(`Ignoring error while associating the hosted zones to VPC "${vpcConfig.name}"`);
        console.error(e);
      });
      associateHostedZonePromises.push(associateHostedZonePromise);
    }

    // Wait for all hosted zones to be associated
    await Promise.all(associateHostedZonePromises);

    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const r53Resolver = new Route53Resolver(credentials);
    for (const accountRule of accountRules) {
      try {
        await r53Resolver.associateResolverRule(accountRule.ruleId, vpcId);
      } catch (e) {
        console.error(`Ignoring error while associating the resolver rule to VPC "${vpcConfig.name}"`);
        console.error(e);
      }
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Associated Hosted Zones and resolver rules with the VPC',
  };
};

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
  const { assumeRoleName, vpcAccountId, hostedZoneAccountId, hostedZoneId, vpcId, vpcRegion } = props;

  const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
  const vpcRoute53 = new Route53(vpcAccountCredentials);

  const hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
  const hostedZoneRoute53 = new Route53(hostedZoneAccountCredentials);

  // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
  if (vpcAccountId !== hostedZoneAccountId) {
    await hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneId, vpcId, vpcRegion);
  }

  // associate VPC with Hosted zones
  try {
    await vpcRoute53.associateVPCWithHostedZone(hostedZoneId, vpcId, vpcRegion);
  } catch (e) {
    if (e.code === 'ConflictingDomainExists') {
      // Domain already added; ignore this error and continue
      console.log('Ignoring ConflictingDomainExists exception and continuing...');
    }
  }

  // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
  if (vpcAccountId !== hostedZoneAccountId) {
    await hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneId, vpcId, vpcRegion);
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
