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
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { delay, throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  vpcId: string;
  domain: string;
  region: string;
  comment: string;
}

const route53 = new AWS.Route53();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create Hosted Zone..`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreateOrUpdate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { comment, vpcId, domain, region } = properties;
  let hostedZoneId: string;
  // Sleep 1 to 10 random seconds after creation of the vpc endpoint to avoid RateExceeded issue with Route53 api accross regions
  await delay(Math.floor(Math.random() * (10000 - 1000 + 1) + 1000));
  try {
    const hostedZone = await throttlingBackOff(() =>
      route53
        .createHostedZone({
          CallerReference: `${vpcId}-${domain}-${new Date().getTime()}`,
          Name: domain,
          HostedZoneConfig: {
            Comment: comment,
            PrivateZone: true,
          },
          VPC: {
            VPCId: vpcId,
            VPCRegion: region,
          },
        })
        .promise(),
    );
    hostedZoneId = hostedZone.HostedZone.Id;
  } catch (e) {
    console.log(e);
    if (e.code === 'ConflictingDomainExists') {
      const hostedZone = await throttlingBackOff(() =>
        route53
          .listHostedZonesByVPC({
            VPCId: vpcId,
            VPCRegion: region,
          })
          .promise(),
      );
      hostedZoneId = hostedZone.HostedZoneSummaries[0].HostedZoneId;
    } else {
      throw new Error(e);
    }
  }
  return {
    physicalResourceId: `${vpcId}-${domain}`,
    data: {
      ZoneId: hostedZoneId,
    },
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting Hosted Zone...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { vpcId, domain, region } = properties;
  if (event.PhysicalResourceId !== `${vpcId}-${domain}`) {
    return;
  }
  try {
    const hostedZones = await throttlingBackOff(() =>
      route53
        .listHostedZonesByVPC({
          VPCId: vpcId,
          VPCRegion: region,
        })
        .promise(),
    );
    const hostedZoneId = hostedZones.HostedZoneSummaries.find(hz => hz.Name === domain)?.HostedZoneId;
    // Sleep 1 to 10 random seconds after creation of the vpc endpoint to avoid RateExceeded issue with Route53 api across regions
    await delay(Math.floor(Math.random() * (10000 - 1000 + 1) + 1000));
    await throttlingBackOff(() =>
      route53
        .deleteHostedZone({
          Id: hostedZoneId!,
        })
        .promise(),
    );
  } catch (e) {
    console.error(e);
  }
}
