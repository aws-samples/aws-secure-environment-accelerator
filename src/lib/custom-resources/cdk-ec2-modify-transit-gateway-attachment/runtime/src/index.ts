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
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { ModifyTransitGatewayVpcAttachmentRequest } from 'aws-sdk/clients/ec2';

export interface HandlerProperties {
  subnetIds: string[];
  transitGatewayAttachmentId: string;
  ignoreWhileDeleteSubnets: string[];
}

const ec2 = new AWS.EC2();
export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Modify Trasit Gateway Attachments..`);
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
  const { subnetIds, transitGatewayAttachmentId } = properties;
  const existingAttachmentResponse = await throttlingBackOff(() =>
    ec2
      .describeTransitGatewayVpcAttachments({
        TransitGatewayAttachmentIds: [transitGatewayAttachmentId],
      })
      .promise(),
  );
  const attachedSubnets: string[] =
    existingAttachmentResponse.TransitGatewayVpcAttachments?.map(tgwAttach => tgwAttach.SubnetIds).flatMap(
      tgw => tgw!,
    ) || [];
  const removeSubnetIds: string[] = attachedSubnets.filter(s => !subnetIds.includes(s));
  const attachSubnetIds: string[] = subnetIds.filter(s => !attachedSubnets.includes(s));
  let modifyTgwAttach = false;
  const modifyParams: ModifyTransitGatewayVpcAttachmentRequest = {
    TransitGatewayAttachmentId: transitGatewayAttachmentId,
  };
  if (attachSubnetIds.length > 0) {
    modifyParams.AddSubnetIds = attachSubnetIds;
    modifyTgwAttach = true;
  }
  if (removeSubnetIds.length > 0) {
    modifyParams.RemoveSubnetIds = removeSubnetIds;
    modifyTgwAttach = true;
  }
  if (modifyTgwAttach) {
    await throttlingBackOff(() => ec2.modifyTransitGatewayVpcAttachment(modifyParams).promise());
  }
  return {
    physicalResourceId: `ModifyTransitGatewayVpcAttachment-${transitGatewayAttachmentId}`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting Log Group Metric filter...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { transitGatewayAttachmentId, ignoreWhileDeleteSubnets } = properties;
  if (event.PhysicalResourceId !== `ModifyTransitGatewayVpcAttachment-${transitGatewayAttachmentId}`) {
    return {
      physicalResourceId: `ModifyTransitGatewayVpcAttachment-${transitGatewayAttachmentId}`,
    };
  }
  const existingAttachmentResponse = await throttlingBackOff(() =>
    ec2
      .describeTransitGatewayVpcAttachments({
        TransitGatewayAttachmentIds: [transitGatewayAttachmentId],
      })
      .promise(),
  );
  const attachedSubnets: string[] =
    existingAttachmentResponse.TransitGatewayVpcAttachments?.map(tgwAttach => tgwAttach.SubnetIds).flatMap(
      tgw => tgw!,
    ) || [];
  const removeSubnets = attachedSubnets.filter(s => !ignoreWhileDeleteSubnets.includes(s));
  let modifyTgwAttach = false;
  const modifyParams: ModifyTransitGatewayVpcAttachmentRequest = {
    TransitGatewayAttachmentId: transitGatewayAttachmentId,
  };
  if (removeSubnets.length > 0) {
    modifyParams.RemoveSubnetIds = removeSubnets;
    modifyTgwAttach = true;
  }
  if (modifyTgwAttach) {
    await throttlingBackOff(() => ec2.modifyTransitGatewayVpcAttachment(modifyParams).promise());
  }
  return {
    physicalResourceId: `ModifyTransitGatewayVpcAttachment-${transitGatewayAttachmentId}`,
  };
}
