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
import { DescribeTransitGatewayPeeringAttachmentsCommandInput, EC2 } from '@aws-sdk/client-ec2';
// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

export const handler = errorHandler(onEvent);

const ec2 = new EC2({
  logger: console,
});

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Accepting transit gateway peering attachment...`);
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

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const pendingPeeringAttachments = await throttlingBackOff(() =>
    ec2
      .describeTransitGatewayPeeringAttachments(buildDescribeTransitGatewayAttachmentsResult({
      transitGatewayAttachmentId: event.ResourceProperties.attachmentId,
    })),
  );

  if (
    pendingPeeringAttachments.TransitGatewayPeeringAttachments &&
    pendingPeeringAttachments.TransitGatewayPeeringAttachments.length !== 0
  ) {
    // Accepting transit gateway peering attachment invite
    await throttlingBackOff(() =>
      ec2
        .acceptTransitGatewayPeeringAttachment({
          TransitGatewayAttachmentId: event.ResourceProperties.attachmentId,
        }),
    );

    await throttlingBackOff(() =>
      ec2
        .createTags({
          Resources: [event.ResourceProperties.attachmentId],
          Tags: [
            {
              Key: 'Name',
              Value: event.ResourceProperties.tagValue,
            },
          ],
        }),
    );
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

/**
 * Auxiliary method to build a DescribeTransitGatewayPeeringAttachmentsRequest from the given parameters.
 */
function buildDescribeTransitGatewayAttachmentsResult(props: {
  transitGatewayAttachmentId: string;
}): DescribeTransitGatewayPeeringAttachmentsCommandInput {
  const { transitGatewayAttachmentId } = props;

  return {
    Filters: [
      {
        Name: 'state',
        Values: ['pendingAcceptance'],
      },
      {
        Name: 'transit-gateway-attachment-id',
        Values: [transitGatewayAttachmentId],
      },
    ],
  };
}
