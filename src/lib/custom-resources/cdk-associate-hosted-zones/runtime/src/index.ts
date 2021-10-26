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

  // eslint-disable-next-line default-case
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
  const vpcRoute53 = new AWS.Route53({
    credentials: vpcAccountCredentials,
  });

  let hostedZoneAccountCredentials: AWS.Credentials;
  let hostedZoneRoute53: AWS.Route53;
  if (vpcAccountId !== hostedZoneAccountId) {
    hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
    hostedZoneRoute53 = new AWS.Route53({
      credentials: hostedZoneAccountCredentials,
    });
  }

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
        console.error(`Error while associating the hosted zone "${hostedZoneId}" to VPC "${vpcName}"`);
        console.error(e);
        throw new Error(e);
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
  const vpcRoute53 = new AWS.Route53({
    credentials: vpcAccountCredentials,
  });

  let hostedZoneAccountCredentials: AWS.Credentials;
  let hostedZoneRoute53: AWS.Route53;
  if (vpcAccountId !== hostedZoneAccountId) {
    hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
    hostedZoneRoute53 = new AWS.Route53({
      credentials: hostedZoneAccountCredentials,
    });
  }

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
      try {
        await throttlingBackOff(() => hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneProps).promise());
      } catch (e) {
        if (e.code === 'NoSuchHostedZone') {
          console.info(`No Domain exists with ID "${hostedZoneId}"; ignore this error and continue`);
          continue;
        } else {
          throw new Error(e);
        }
      }
    }

    // associate VPC with Hosted zones
    try {
      console.log(`Disassociating hosted zone ${hostedZoneId} with VPC ${vpcId} ${vpcName}...`);
      await throttlingBackOff(() => vpcRoute53.disassociateVPCFromHostedZone(hostedZoneProps).promise());
    } catch (e) {
      if (e.code === 'VPCAssociationNotFound') {
        console.warn(`The specified VPC "${vpcId}" and hosted zone "${hostedZoneId}" are not currently associated.`);
      } else if (e.code === 'NoSuchHostedZone') {
        console.warn(`The specified hosted zone "${hostedZoneId}" doesn't exist.`);
        continue;
      } else {
        console.error(`Error while associating the hosted zone "${hostedZoneId}" to VPC "${vpcName}"`);
        console.error(e);
        throw new Error(e);
      }
    }

    // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      try {
        await throttlingBackOff(() => hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneProps).promise());
      } catch (e) {
        if (e.code === 'VPCAssociationNotFound') {
          console.warn(`The specified VPC "${vpcId}" and hosted zone "${hostedZoneId}" are not currently associated.`);
        } else if (e.code === 'NoSuchHostedZone') {
          console.warn(`The specified hosted zone "${hostedZoneId}" doesn't exist.`);
        } else {
          console.error(`Error while associating the hosted zone "${hostedZoneId}" to VPC "${vpcName}"`);
          console.error(e);
          throw new Error(e);
        }
      }
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
  if (
    event.PhysicalResourceId !== `AssociateHostedZones-${vpcName}-${vpcRegion}-${vpcAccountId}-${hostedZoneAccountId}`
  ) {
    return;
  }
  const vpcAccountCredentials = await sts.getCredentialsForAccountAndRole(vpcAccountId, assumeRoleName);
  const vpcRoute53 = new AWS.Route53({
    credentials: vpcAccountCredentials,
  });

  let hostedZoneAccountCredentials: AWS.Credentials;
  let hostedZoneRoute53: AWS.Route53;
  if (vpcAccountId !== hostedZoneAccountId) {
    hostedZoneAccountCredentials = await sts.getCredentialsForAccountAndRole(hostedZoneAccountId, assumeRoleName);
    hostedZoneRoute53 = new AWS.Route53({
      credentials: hostedZoneAccountCredentials,
    });
  }

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
      try {
        await throttlingBackOff(() => hostedZoneRoute53.createVPCAssociationAuthorization(hostedZoneProps).promise());
      } catch (e) {
        console.error(`Ignoring error while deleting Association and stack ${hostedZoneId} to VPC "${vpcName}"`);
        console.error(e);
        continue;
      }
    }

    // associate VPC with Hosted zones
    try {
      console.log(`Disassociating hosted zone ${hostedZoneId} with VPC ${vpcId} ${vpcName}...`);
      await throttlingBackOff(() => vpcRoute53.disassociateVPCFromHostedZone(hostedZoneProps).promise());
    } catch (e) {
      console.error(`Ignoring error while deleting Association and stack ${hostedZoneId} to VPC "${vpcName}"`);
      console.error(e);
      if (e.code === 'NoSuchHostedZone') {
        console.warn(`The specified hosted zone "${hostedZoneId}" doesn't exist.`);
        continue;
      }
    }

    // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
    if (vpcAccountId !== hostedZoneAccountId) {
      try {
        await throttlingBackOff(() => hostedZoneRoute53.deleteVPCAssociationAuthorization(hostedZoneProps).promise());
      } catch (e) {
        console.error(`Ignoring error while deleting Association and stack ${hostedZoneId} to VPC "${vpcName}"`);
        console.error(e);
      }
    }
  }
}
