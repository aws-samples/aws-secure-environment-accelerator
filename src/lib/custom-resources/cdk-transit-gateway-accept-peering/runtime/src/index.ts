import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

export const handler = errorHandler(onEvent);

const ec2 = new AWS.EC2();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Accepting transit gateway peering attachment...`);
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

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const pendingPeeringAttachments = await throttlingBackOff(() =>
    ec2
      .describeTransitGatewayPeeringAttachments(
        buildDescribeTransitGatewayAttachmentsResult({
          transitGatewayAttachmentId: event.ResourceProperties.attachmentId,
        }),
      )
      .promise(),
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
        })
        .promise(),
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
        })
        .promise(),
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
}): AWS.EC2.DescribeTransitGatewayPeeringAttachmentsRequest {
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
