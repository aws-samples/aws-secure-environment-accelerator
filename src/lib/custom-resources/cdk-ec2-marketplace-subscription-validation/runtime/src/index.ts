import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import * as AWS from 'aws-sdk';

export interface HandlerProperties {
  imageId: string;
  subnetId: string;
  instanceType?: string;
}

const ec2 = new AWS.EC2();
export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Amazon MarketPlace Supscription check...`);
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
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  var instanceParams = {
    ImageId: properties.imageId,
    SubnetId: properties.subnetId,
    InstanceType: properties.instanceType || 't2.micro',
    MinCount: 1,
    MaxCount: 1,
  };
  let status = 'Subscribed';
  try {
    await ec2.runInstances(instanceParams).promise();
    console.log('Create Firewall Instance Success');
  } catch (error) {
    if (error.code === 'OptInRequired') {
      status = error.code;
    }
  }
  return {
    physicalResourceId: `SubscriptionCheck-${properties.imageId}`,
    data: {
      Status: status,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
