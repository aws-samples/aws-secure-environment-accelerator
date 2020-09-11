import * as AWS from 'aws-sdk';
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  assumeRoleName: string;
  vpcAccountId: string;
  vpcName: string;
  vpcId: string;
  vpcRegion: string;
  hostedZoneAccountId: string;
  hostedZoneIds: string[];
}

export class STS {
  private readonly client: AWS.STS;
  private readonly cache: { [roleArn: string]: AWS.Credentials } = {};

  constructor(credentials?: AWS.Credentials) {
    this.client = new AWS.STS({
      credentials,
    });
  }

  async getCallerIdentity(): Promise<GetCallerIdentityResponse> {
    return throttlingBackOff(() => this.client.getCallerIdentity().promise());
  }

  async getCredentialsForRoleArn(assumeRoleArn: string, durationSeconds: number = 3600): Promise<AWS.Credentials> {
    if (this.cache[assumeRoleArn]) {
      const cachedCredentials = this.cache[assumeRoleArn];
      const currentDate = new Date();
      if (cachedCredentials.expireTime && cachedCredentials.expireTime.getTime() < currentDate.getTime()) {
        return cachedCredentials;
      }
    }

    const response = await throttlingBackOff(() =>
      this.client
        .assumeRole({
          RoleArn: assumeRoleArn,
          RoleSessionName: 'temporary', // TODO Generate a random name
          DurationSeconds: durationSeconds,
        })
        .promise(),
    );

    const stsCredentials = response.Credentials!;
    const credentials = new AWS.Credentials({
      accessKeyId: stsCredentials.AccessKeyId,
      secretAccessKey: stsCredentials.SecretAccessKey,
      sessionToken: stsCredentials.SessionToken,
    });
    this.cache[assumeRoleArn] = credentials;
    return credentials;
  }

  async getCredentialsForAccountAndRole(
    accountId: string,
    assumeRole: string,
    durationSeconds?: number,
  ): Promise<AWS.Credentials> {
    return this.getCredentialsForRoleArn(`arn:aws:iam::${accountId}:role/${assumeRole}`, durationSeconds);
  }
}

const sts = new STS();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Associating HostedZones to VPC..`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { assumeRoleName, hostedZoneAccountId, hostedZoneIds, vpcAccountId, vpcId, vpcName, vpcRegion } = properties;

  const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
  const vpcRoute53 = new AWS.Route53(vpcAccountCredentials);

  const hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
  const hostedZoneRoute53 = new AWS.Route53(hostedZoneAccountCredentials);

  for (const hostedZoneId of hostedZoneIds) {
    const hostedZoneProps = {
      HostedZoneId: hostedZoneId,
      VPC: {
        VPCId: vpcId,
        VPCRegion: vpcRegion,
      },
    };
    // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneProps).promise());
    }

    // associate VPC with Hosted zones
    try {
      console.log(`Associating hosted zone ${hostedZoneId} with VPC ${vpcId} ${vpcName}...`);
      await throttlingBackOff(() => vpcRoute53.associateVPCWithHostedZone(hostedZoneProps).promise());
    } catch (e) {
      if (e.code === 'ConflictingDomainExists') {
        console.info('Domain already added; ignore this error and continue');
      } else {
        // TODO Handle errors
        console.error(`Ignoring error while associating the hosted zone ${hostedZoneId} to VPC "${vpcName}"`);
        console.error(e);
      }
    }

    // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneProps).promise());
    }
  }

  return {
    physicalResourceId: `AssociateHostedZones-${vpcName}-${vpcRegion}-${vpcAccountId}-${hostedZoneAccountId}`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { assumeRoleName, hostedZoneAccountId, hostedZoneIds, vpcAccountId, vpcId, vpcName, vpcRegion } = properties;

  const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
  const vpcRoute53 = new AWS.Route53(vpcAccountCredentials);

  const hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
  const hostedZoneRoute53 = new AWS.Route53(hostedZoneAccountCredentials);

  const oldProperties = (event.OldResourceProperties as unknown) as HandlerProperties;
  const currentAssociations = hostedZoneIds.filter(hz => !oldProperties.hostedZoneIds.includes(hz));
  const removeAssociations = oldProperties.hostedZoneIds.filter(hz => !hostedZoneIds.includes(hz));
  for (const hostedZoneId of currentAssociations) {
    const hostedZoneProps = {
      HostedZoneId: hostedZoneId,
      VPC: {
        VPCId: vpcId,
        VPCRegion: vpcRegion,
      },
    };
    // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneProps).promise());
    }

    // associate VPC with Hosted zones
    try {
      console.log(`Associating hosted zone ${hostedZoneId} with VPC ${vpcId} ${vpcName}...`);
      await throttlingBackOff(() => vpcRoute53.associateVPCWithHostedZone(hostedZoneProps).promise());
    } catch (e) {
      if (e.code === 'ConflictingDomainExists') {
        console.info('Domain already added; ignore this error and continue');
      } else {
        // TODO Handle errors
        console.error(`Ignoring error while associating the hosted zone ${hostedZoneId} to VPC "${vpcName}"`);
        console.error(e);
      }
    }

    // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneProps).promise());
    }
  }

  for (const hostedZoneId of removeAssociations) {
    const hostedZoneProps = {
      HostedZoneId: hostedZoneId,
      VPC: {
        VPCId: vpcId,
        VPCRegion: vpcRegion,
      },
    };
    // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneProps).promise());
    }

    // associate VPC with Hosted zones
    try {
      console.log(`Disassociating hosted zone ${hostedZoneId} with VPC ${vpcId} ${vpcName}...`);
      await throttlingBackOff(() => vpcRoute53.disassociateVPCFromHostedZone(hostedZoneProps).promise());
    } catch (e) {
      if (e.code === 'ConflictingDomainExists') {
        console.info('Domain already added; ignore this error and continue');
      } else {
        // TODO Handle errors
        console.error(`Ignoring error while associating the hosted zone ${hostedZoneId} to VPC "${vpcName}"`);
        console.error(e);
      }
    }

    // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneProps).promise());
    }
  }

  return {
    physicalResourceId: `AssociateHostedZones-${vpcName}-${vpcRegion}-${vpcAccountId}-${hostedZoneAccountId}`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting Log Group Metric filter...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { assumeRoleName, hostedZoneAccountId, hostedZoneIds, vpcAccountId, vpcId, vpcName, vpcRegion } = properties;

  const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
  const vpcRoute53 = new AWS.Route53(vpcAccountCredentials);

  const hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
  const hostedZoneRoute53 = new AWS.Route53(hostedZoneAccountCredentials);

  for (const hostedZoneId of hostedZoneIds) {
    const hostedZoneProps = {
      HostedZoneId: hostedZoneId,
      VPC: {
        VPCId: vpcId,
        VPCRegion: vpcRegion,
      },
    };
    // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneProps).promise());
    }

    // associate VPC with Hosted zones
    try {
      console.log(`Disassociating hosted zone ${hostedZoneId} with VPC ${vpcId} ${vpcName}...`);
      await throttlingBackOff(() => vpcRoute53.disassociateVPCFromHostedZone(hostedZoneProps).promise());
    } catch (e) {
      if (e.code === 'ConflictingDomainExists') {
        console.info('Domain already added; ignore this error and continue');
      } else {
        // TODO Handle errors
        console.error(`Ignoring error while associating the hosted zone ${hostedZoneId} to VPC "${vpcName}"`);
        console.error(e);
      }
    }

    // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      await throttlingBackOff(() => hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneProps).promise());
    }
  }
}
