import * as aws from 'aws-sdk';
import {
  ListHostedZonesResponse,
  AssociateVPCWithHostedZoneResponse,
  CreateVPCAssociationAuthorizationResponse,
  DeleteVPCAssociationAuthorizationResponse,
} from 'aws-sdk/clients/route53';
import { ListResolverRulesResponse, AssociateResolverRuleResponse } from 'aws-sdk/clients/route53resolver';
import { CreateResourceShareRequest, CreateResourceShareResponse } from 'aws-sdk/clients/ram';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig, VpcConfigType, InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from './load-accounts-step';
import { getAccountId } from '../../templates/src/utils/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getStackJsonOutput, StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { VpcOutput } from '../../templates/src/apps/phase-1';
import { Route53 } from '@aws-pbmm/common-lambda/lib/aws/route53';
import { Route53Resolver } from '@aws-pbmm/common-lambda/lib/aws/r53resolver';
import { RAM } from '@aws-pbmm/common-lambda/lib/aws/ram';
import * as t from 'io-ts';
import { delay } from '@aws-pbmm/common-lambda/lib/util/delay';

interface AssociateHostedZonesInput {
  accounts: Account[];
  assumeRoleName: string;
  configSecretSourceId: string;
  stackOutputSecretId: string;
}

export const handler = async (input: AssociateHostedZonesInput) => {
  console.log(`Associating Hosted Zones with VPC...`);
  console.log(JSON.stringify(input, null, 2));

  const { configSecretSourceId, accounts, assumeRoleName, stackOutputSecretId } = input;

  const secrets = new SecretsManager();

  const source = await secrets.getSecret(configSecretSourceId);
  const acceleratorConfig = AcceleratorConfig.fromString(source.SecretString!);

  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const globalOptionsConfig = acceleratorConfig['global-options'];
  const mandatoryAccountConfigs = acceleratorConfig['mandatory-account-configs'];
  const organizationalUnits = acceleratorConfig['organizational-units'];

  const mandatoryAccountKeys: string[] = [];

  const sts = new STS();

  const allHostedZones: ListHostedZonesResponse['HostedZones'][] = [];
  const allPrivateHostedZones: ListHostedZonesResponse['HostedZones'][] = [];
  const allPrivateHostedZonesId: string[] = [];
  let hostedZonesAccountId: string = '';
  let hostedZonesAccountCredentials: aws.Credentials;

  // get the private zones from global-options
  const privateZones = globalOptionsConfig.zones.names.private;
  console.log(`private zones from global config - ${privateZones}`);

  console.log('getting all private hosted zones from Route 53');
  // get all hosted zones ID
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfigs)) {
    mandatoryAccountKeys.push(accountKey);

    // if VPC section not found, move to next account
    const vpcConfig = accountConfig.vpc;
    if (!VpcConfigType.is(vpcConfig)) {
      console.log(`VPC is not defined for account key - ${accountKey}. Moving to next account.`);
      continue;
    }

    // if Interface Endpoint section not found, move to next account
    const interfaceEndpointConfig = vpcConfig['interface-endpoints'];
    if (!InterfaceEndpointConfig.is(interfaceEndpointConfig)) {
      console.log(`Interface Endpoints are not defined for account key - ${accountKey}. Moving to next account.`);
      continue;
    }

    // if interface endpoints are defined, pick the account name
    if (!t.string.is(interfaceEndpointConfig.subnet)) {
      console.log(
        `Hosted Zones are not created in the account with account key - ${accountKey}. Moving to next account.`,
      );
      continue;
    }
    console.log(
      `Hosted Zones are created in the account with account key - ${accountKey}. Finding all private hosted zones.`,
    );

    hostedZonesAccountId = getAccountId(accounts, accountKey);
    hostedZonesAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZonesAccountId, assumeRoleName);
    const route53 = new Route53(hostedZonesAccountCredentials);

    let listHostedZonesResponse = await route53.listHostedZones('1');

    // get all hosted zones
    allHostedZones.push(listHostedZonesResponse.HostedZones);
    while (listHostedZonesResponse.IsTruncated === true) {
      const nextMarker = listHostedZonesResponse.NextMarker;
      listHostedZonesResponse = await route53.listHostedZones('1', nextMarker);
      allHostedZones.push(listHostedZonesResponse.HostedZones);
    }
    console.log('All Hosted Zones: ', allHostedZones);

    // get all private hosted zones
    for (const eachHostedZone of allHostedZones) {
      if (eachHostedZone[0].Name.includes('ca-central-1.amazonaws.com')) {
        allPrivateHostedZones.push(eachHostedZone);
      } else {
        for (const privateZone of privateZones) {
          if (eachHostedZone[0].Name.includes(privateZone)) {
            allPrivateHostedZones.push(eachHostedZone);
          }
        }
      }
    }
    console.log('All Private Hosted Zones: ', allPrivateHostedZones);

    // get all private hosted zones Id
    for (const eachPrivateHostedZone of allPrivateHostedZones) {
      const privateHostedZoneId: string = eachPrivateHostedZone[0].Id.split('/')[2];
      allPrivateHostedZonesId.push(privateHostedZoneId);
    }
    console.log('All Private Hosted Zones ID: ', allPrivateHostedZonesId);
  }

  const sharedAccountIdsWithVpcIds: { [accountId: string]: string } = {};
  const sharedAccountIdsWithCredentials: { [accountId: string]: aws.Credentials } = {};

  const associateHostedZone = async (
    vpcAccountId: string,
    hostedZoneAccountId: string,
    privateHostedZoneId: string,
    vpcId: string,
    vpcRegion: string,
  ): Promise<void> => {
    sharedAccountIdsWithVpcIds[vpcAccountId] = vpcId;

    const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
    const vpcRoute53 = new Route53(vpcAccountCredentials);

    sharedAccountIdsWithCredentials[vpcAccountId] = vpcAccountCredentials;

    const hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
    const hostedZoneRoute53 = new Route53(hostedZoneAccountCredentials);

    // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      const createVPCAssociationAuthorizationResponse: CreateVPCAssociationAuthorizationResponse = await hostedZoneRoute53.createVPCAssociationAuthorization(
        privateHostedZoneId,
        vpcId,
        vpcRegion,
      );
      console.log('createVPCAssociationAuthorizationResponse: ', createVPCAssociationAuthorizationResponse);
    }

    // associate VPC with Hosted zones
    try {
      const associateVPCWithHostedZoneResponse: AssociateVPCWithHostedZoneResponse = await vpcRoute53.associateVPCWithHostedZone(
        privateHostedZoneId,
        vpcId,
        vpcRegion,
      );
      console.log('associateVPCWithHostedZoneResponse: ', associateVPCWithHostedZoneResponse);
    } catch (e) {
      if (e.code === 'ConflictingDomainExists') {
        // Domain already added; ignore this error and continue
        console.log('Exception message: ' + e.message);
        console.log('Ignoring exception and continuing...');
      } else if (e.code === 'NotAuthorizedException') {
        // not authorized error; throw exception
        console.log('Exception message: ' + e.message);
        console.log('Stopping further exceution...');
        throw e;
      }
    }

    // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      const deleteVPCAssociationAuthorizationResponse: DeleteVPCAssociationAuthorizationResponse = await hostedZoneRoute53.deleteVPCAssociationAuthorization(
        privateHostedZoneId,
        vpcId,
        vpcRegion,
      );
      console.log('deleteVPCAssociationAuthorizationResponse: ', deleteVPCAssociationAuthorizationResponse);
    }
  };

  console.log('Starting association of private hosted zones with mandatory accounts VPC...');
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfigs)) {
    // if VPC section not found, move to next account
    const vpcConfig = accountConfig.vpc;
    if (!VpcConfigType.is(vpcConfig)) {
      console.log(`VPC is not defined for account with key - ${accountKey}. Moving to next account.`);
      continue;
    }

    console.log(`account-key: ${accountKey}; use-central-endpoints: ${vpcConfig['use-central-endpoints']}`);
    if (vpcConfig['use-central-endpoints'] === false) {
      console.log(`use-central-enpoints is set as false for account with key - ${accountKey}. Moving to next account.`);
      continue;
    }

    const vpcAccountId = getAccountId(accounts, accountKey);

    for (const privateHostedZoneId of allPrivateHostedZonesId) {
      const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
        accountKey,
        outputType: 'VpcOutput',
      });
      const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
      const vpcId = vpcOutput!.vpcId;
      const vpcRegion = vpcConfig.region;

      // associate the hosted zones with VPC
      await associateHostedZone(vpcAccountId, hostedZonesAccountId, privateHostedZoneId, vpcId, vpcRegion);
    }
  }
  console.log('Completed association of private hosted zones with mandatory accounts VPC...');

  console.log('Starting association of private hosted zones with organizational units accounts VPC...');
  for (const [orgKey, orgUnit] of Object.entries(organizationalUnits)) {
    // if VPC section not found, move to next account
    const vpcConfig = orgUnit.vpc;
    if (!VpcConfigType.is(vpcConfig)) {
      console.log(`VPC is not defined for organizational unit with key - ${orgKey}. Moving to next org unit.`);
      continue;
    }

    console.log(`org-key: ${orgKey}; use-central-endpoints: ${vpcConfig['use-central-endpoints']}`);
    if (vpcConfig['use-central-endpoints'] === false) {
      console.log(
        `use-central-enpoints is set as false for organizational unit with key - ${orgKey}. Moving to next org unit.`,
      );
      continue;
    }

    const vpcAccountKey = orgUnit.vpc!.deploy!;
    if (mandatoryAccountKeys.includes(vpcAccountKey)) {
      console.log(
        `Association of private hosted zones done already for organization unit with key - ${orgKey} and account key - ${vpcAccountKey}. Moving to next org unit.`,
      );
      continue;
    }

    const vpcAccountId = getAccountId(accounts, vpcAccountKey);

    for (const privateHostedZoneId of allPrivateHostedZonesId) {
      const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
        accountKey: vpcAccountKey,
        outputType: 'VpcOutput',
      });
      const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
      const vpcId = vpcOutput!.vpcId;
      const vpcRegion = vpcConfig.region;

      // associate the hosted zones with VPC
      await associateHostedZone(vpcAccountId, hostedZonesAccountId, privateHostedZoneId, vpcId, vpcRegion);
    }
  }
  console.log('Completed association of private hosted zones with organizational units accounts VPC...');

  console.log('Starting association of resolver rules with accounts to which VPCs are shared...');
  hostedZonesAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZonesAccountId, assumeRoleName);
  const route53Resolver = new Route53Resolver(hostedZonesAccountCredentials);
  const listResolverRulesResponse: ListResolverRulesResponse = await route53Resolver.listResolverRules(100);
  console.log('Route 53 - Resolver Rules: ', listResolverRulesResponse);

  const resolverRuleArns: string[] = [];
  const resolverRuleIds: string[] = [];
  for (const resolverRule of listResolverRulesResponse.ResolverRules!) {
    if (resolverRule.RuleType === 'FORWARD') {
      resolverRuleArns.push(resolverRule.Arn!);
      resolverRuleIds.push(resolverRule.Id!);
    }
  }
  console.log('resolverRuleArns: ', resolverRuleArns);

  const ram = new RAM(hostedZonesAccountCredentials);

  console.log('sharedAccountIdsWithVpcIds: ', sharedAccountIdsWithVpcIds);
  console.log('sharedAccountIdsWithCredentials: ', sharedAccountIdsWithCredentials);

  const sharedAccountIds = [...Object.keys(sharedAccountIdsWithVpcIds)];
  console.log('sharedAccountIds: ' + sharedAccountIds);

  const params: CreateResourceShareRequest = {
    name: 'pbmm-accel-shared-resolver-rules',
    resourceArns: resolverRuleArns,
    principals: sharedAccountIds,
  };
  const createResourceShareResponse: CreateResourceShareResponse = await ram.createResourceShare(params);
  console.log('Resource Share Response: ', createResourceShareResponse);

  for (const [eachAccountId, sharedVpcId] of Object.entries(sharedAccountIdsWithVpcIds)) {
    const credentials = sharedAccountIdsWithCredentials[eachAccountId];
    const r53Resolver = new Route53Resolver(credentials);

    // resource shared is not available immediately. so adding a check and wait here.
    let waitCondition: boolean = true;
    do {
      console.log('waiting 5 secs for the resolver rules to show up in the shared account...');
      await delay(5000);
      const response = await route53Resolver.listResolverRules(100);
      for (const resolverRule of response.ResolverRules!) {
        if (resolverRuleIds.includes(resolverRule.Id!)) {
          waitCondition = false;
        } else {
          waitCondition = true;
        }
      }
    } while (waitCondition);

    for (const resolverRuleId of resolverRuleIds) {
      const associateResolverRuleResponse: AssociateResolverRuleResponse = await r53Resolver.associateResolverRule(
        resolverRuleId,
        sharedVpcId,
      );
      console.log('associateResolverRuleResponse: ', associateResolverRuleResponse);
    }
  }
  console.log('Completed association of resolver rules with accounts to which VPCs are shared...');

  return {
    status: 'SUCCESS',
    statusReason: 'Associated Hosted Zones and resolver rules with the VPC',
  };
};
