import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export const handler = errorHandler(onEvent);

const ec2 = new AWS.EC2();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create transit gateway peering attachment...`);
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
  const peeringAttachment = await throttlingBackOff(() =>
    ec2
      .createTransitGatewayPeeringAttachment({
        TransitGatewayId: event.ResourceProperties.transitGatewayId,
        PeerTransitGatewayId: event.ResourceProperties.targetTransitGatewayId,
        PeerAccountId: event.ResourceProperties.targetAccountId,
        PeerRegion: event.ResourceProperties.targetRegion,
        TagSpecifications: [
          {
            ResourceType: 'transit-gateway-attachment',
            Tags: [
              {
                Key: 'Name',
                Value: event.ResourceProperties.tagValue,
              },
            ],
          },
        ],
      })
      .promise(),
  );
  return {
    physicalResourceId: peeringAttachment.TransitGatewayPeeringAttachment!.TransitGatewayAttachmentId,
    data: {
      peeringAttachmentId: peeringAttachment.TransitGatewayPeeringAttachment!.TransitGatewayAttachmentId,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  return onCreate(event);
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting the transit gateway peering attachment...`);
  await throttlingBackOff(() =>
    ec2
      .deleteTransitGatewayPeeringAttachment({
        TransitGatewayAttachmentId: event.PhysicalResourceId,
      })
      .promise(),
  );
}
