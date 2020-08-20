import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ec2 = new AWS.EC2();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Finding launch time...`);
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
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  // Find instances that match the given instance id
  const describeInstances = await throttlingBackOff(() => ec2
    .describeInstances(
      buildRequest({
        instanceId: event.ResourceProperties.InstanceId,
      }),
    )
    .promise());

  const reservations = describeInstances.Reservations;
  const instance = reservations?.[0].Instances?.[0];
  if (!instance) {
    throw new Error(`Unable to find instance`);
  }

  return {
    Data: {
      LaunchTime: instance.LaunchTime,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

/**
 * Auxiliary method to build a DescribeInstancesRequest from the given parameters.
 */
function buildRequest(props: { instanceId: string }): AWS.EC2.DescribeInstancesRequest {
  const { instanceId } = props;

  const instanceIds = [];
  if (instanceId) {
    instanceIds.push(instanceId);
  }

  return {
    InstanceIds: instanceIds,
  };
}
