import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig, VpcConfigType, InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import * as t from 'io-ts';
import { Account } from './load-accounts-step';
import { getAccountId } from '../../templates/src/utils/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getStackOutput, StackOutputs } from '../../templates/src/utils/outputs';
import { Route53 } from '@aws-pbmm/common-lambda/lib/aws/route53';
import {
  ListHostedZonesRequest,
  ListHostedZonesResponse,
  AssociateVPCWithHostedZoneRequest,
  AssociateVPCWithHostedZoneResponse,
  CreateVPCAssociationAuthorizationRequest,
  CreateVPCAssociationAuthorizationResponse,
  DeleteVPCAssociationAuthorizationRequest,
  DeleteVPCAssociationAuthorizationResponse,
} from 'aws-sdk/clients/route53';

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
  const configString = source.SecretString!;
  const acceleratorConfig = AcceleratorConfig.fromString(configString);

  const globalOptionsConfig = acceleratorConfig['global-options'];
  const mandatoryAccountConfigs = acceleratorConfig['mandatory-account-configs'];
  const organziationalUnits = acceleratorConfig['organizational-units'];

  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutputs;

  const sts = new STS();

  const mandatoryAccounts: string[] = globalOptionsConfig.accounts.mandatory;
  mandatoryAccounts.push(globalOptionsConfig.accounts['lz-primary-account']);

  const allHostedZones: ListHostedZonesResponse['HostedZones'][] = [];
  const allPrivateHostedZones: ListHostedZonesResponse['HostedZones'][] = [];
  const allPrivateHostedZonesId: string[] = [];
  let hostedZonesAccountId: string;
  let hostedZonesAccountCredentials: aws.Credentials;

  // get all hosted zones ID
  for (const mandatoryAccountName of Object.values(mandatoryAccounts)) {
    const accountConfig = mandatoryAccountConfigs[mandatoryAccountName];

    // if VPC section not found, move to next account
    const vpcConfig = accountConfig['vpc'];
    if (!VpcConfigType.is(vpcConfig)) {
      console.log('VPC is not defined. Moving to next account.');
      continue;
    }

    // if Interface Endpoint section not found, move to next account
    const interfaceEndpointConfig = vpcConfig['interface-endpoints'];
    if (!InterfaceEndpointConfig.is(interfaceEndpointConfig)) {
      console.log('Interface Endpoints are not defined. Moving to next account.');
      continue;
    }

    // if interface endpoints are defined, pick the account name
    if (!t.string.is(interfaceEndpointConfig.subnet)) {
      console.log('Interface Endpoints are not created in this account. Moving to next account.');
      continue;
    }

    const hostedZonesAccountName = accountConfig['account-name'];
    hostedZonesAccountId = getAccountId(accounts, hostedZonesAccountName);
    hostedZonesAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZonesAccountId, assumeRoleName);
    const route53 = new Route53(hostedZonesAccountCredentials);

    let listHostedZonesRequest: ListHostedZonesRequest = {
      MaxItems: '1',
    };
    let listHostedZonesResponse = await route53.listHostedZones(listHostedZonesRequest);

    // get all hosted zones
    allHostedZones.push(listHostedZonesResponse.HostedZones);
    while (listHostedZonesResponse.IsTruncated === true) {
      let nextMarker = listHostedZonesResponse.NextMarker;
      listHostedZonesRequest = {
        MaxItems: '1',
        Marker: nextMarker,
      };
      listHostedZonesResponse = await route53.listHostedZones(listHostedZonesRequest);
      allHostedZones.push(listHostedZonesResponse.HostedZones);
    }
    console.log('All Hosted Zones: ', allHostedZones);

    // get all private hosted zones
    for (const eachHostedZone of allHostedZones) {
      if (eachHostedZone[0].Name.includes('ca-central-1.amazonaws.com')) {
        allPrivateHostedZones.push(eachHostedZone);
      }
    }
    console.log('All Private Hosted Zones: ', allPrivateHostedZones);

    // get all private hosted zones Id
    for (const eachPrivateHostedZone of allPrivateHostedZones) {
      let privateHostedZoneId: string = eachPrivateHostedZone[0].Id.split('/')[2];
      allPrivateHostedZonesId.push(privateHostedZoneId);
    }
    console.log('All Private Hosted Zones ID: ', allPrivateHostedZonesId);
  }

  // for each mandatory account
  for (const mandatoryAccountName of Object.values(mandatoryAccounts)) {
    const accountConfig = mandatoryAccountConfigs[mandatoryAccountName];

    // if VPC section not found, move to next account
    const vpcConfig = accountConfig['vpc'];
    if (!VpcConfigType.is(vpcConfig)) {
      console.log('VPC is not defined. Moving to next account.');
      continue;
    }

    if (vpcConfig['use-central-endpoints'] === false) {
      console.log('use-central-enpoints is set as false. Moving to next account.');
      continue;
    }

    const vpcAccountName = accountConfig['account-name'];
    const vpcAccountId = getAccountId(accounts, vpcAccountName);
    const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
    const vpcRoute53 = new Route53(vpcAccountCredentials);

    const hostedZonesRoute53 = new Route53(hostedZonesAccountCredentials!);

    for (const privateHostedZoneId of allPrivateHostedZonesId) {
      const vpcId = getStackOutput(outputs, vpcAccountName, `Vpc${vpcConfig.name}`);
      const vpcRegion = vpcConfig.region;

      // authorize association of VPC with Hosted zones
      const createVPCAssociationAuthorizationRequest: CreateVPCAssociationAuthorizationRequest = {
        HostedZoneId: privateHostedZoneId,
        VPC: {
          VPCId: vpcId,
          VPCRegion: vpcRegion,
        },
      };
      const createVPCAssociationAuthorizationResponse: CreateVPCAssociationAuthorizationResponse = await hostedZonesRoute53.createVPCAssociationAuthorization(
        createVPCAssociationAuthorizationRequest,
      );

      // associate VPC with Hosted zones
      const associateVPCWithHostedZoneRequest: AssociateVPCWithHostedZoneRequest = {
        HostedZoneId: privateHostedZoneId,
        VPC: {
          VPCId: vpcId,
          VPCRegion: vpcRegion,
        },
      };
      const associateVPCWithHostedZoneResponse: AssociateVPCWithHostedZoneResponse = await vpcRoute53.associateVPCWithHostedZone(
        associateVPCWithHostedZoneRequest,
      );

      // delete association of VPC with Hosted zones
      const deleteVPCAssociationAuthorizationRequest: DeleteVPCAssociationAuthorizationRequest = {
        HostedZoneId: privateHostedZoneId,
        VPC: {
          VPCId: vpcId,
          VPCRegion: vpcRegion,
        },
      };
      const deleteVPCAssociationAuthorizationResponse: DeleteVPCAssociationAuthorizationResponse = await hostedZonesRoute53.deleteVPCAssociationAuthorization(
        deleteVPCAssociationAuthorizationRequest,
      );
    }
  }

  // for each organizational unit
  for (const orgUnit of Object.values(organziationalUnits)) {
    // if VPC section not found, move to next account
    const vpcConfig = orgUnit.vpc;
    if (!VpcConfigType.is(vpcConfig)) {
      console.log('VPC is not defined. Moving to next account.');
      continue;
    }

    if (vpcConfig['use-central-endpoints'] === false) {
      console.log('use-central-enpoints is set as false. Moving to next account.');
      continue;
    }

    const vpcAccountName = orgUnit.vpc.deploy!;
    const vpcAccountId = getAccountId(accounts, vpcAccountName);
    const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
    const vpcRoute53 = new Route53(vpcAccountCredentials);

    const hostedZonesRoute53 = new Route53(hostedZonesAccountCredentials!);

    for (const privateHostedZoneId of allPrivateHostedZonesId) {
      const vpcId = getStackOutput(outputs, vpcAccountName, `Vpc${vpcConfig.name}`);
      const vpcRegion = vpcConfig.region;

      // authorize association of VPC with Hosted zones
      if (vpcAccountId !== hostedZonesAccountId!) {
        const createVPCAssociationAuthorizationRequest: CreateVPCAssociationAuthorizationRequest = {
          HostedZoneId: privateHostedZoneId,
          VPC: {
            VPCId: vpcId,
            VPCRegion: vpcRegion,
          },
        };
        const createVPCAssociationAuthorizationResponse: CreateVPCAssociationAuthorizationResponse = await hostedZonesRoute53.createVPCAssociationAuthorization(
          createVPCAssociationAuthorizationRequest,
        );
      }

      // associate VPC with Hosted zones
      const associateVPCWithHostedZoneRequest: AssociateVPCWithHostedZoneRequest = {
        HostedZoneId: privateHostedZoneId,
        VPC: {
          VPCId: vpcId,
          VPCRegion: vpcRegion,
        },
      };
      const associateVPCWithHostedZoneResponse: AssociateVPCWithHostedZoneResponse = await vpcRoute53.associateVPCWithHostedZone(
        associateVPCWithHostedZoneRequest,
      );

      // delete association of VPC with Hosted zones
      if (vpcAccountId !== hostedZonesAccountId!) {
        const deleteVPCAssociationAuthorizationRequest: DeleteVPCAssociationAuthorizationRequest = {
          HostedZoneId: privateHostedZoneId,
          VPC: {
            VPCId: vpcId,
            VPCRegion: vpcRegion,
          },
        };
        const deleteVPCAssociationAuthorizationResponse: DeleteVPCAssociationAuthorizationResponse = await hostedZonesRoute53.deleteVPCAssociationAuthorization(
          deleteVPCAssociationAuthorizationRequest,
        );
      }
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Associated Hosted Zones with the VPC',
  };
};
