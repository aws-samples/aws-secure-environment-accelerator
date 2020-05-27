import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';
import * as AWS from 'aws-sdk';

export interface HandlerProperties {
  imageId: string;
  subnetId: string;
  instanceType: string;
}

const ec2 = new AWS.EC2();
// export const handler = errorHandler(onEvent);

async function onEvent(event: HandlerProperties/*CloudFormationCustomResourceEvent*/) {
  console.log(`Sleeping...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
  // switch (event.RequestType) {
  //   case 'Create':
  //     return onCreate(event);
  //   case 'Update':
  //     return onUpdate(event);
  //   case 'Delete':
  //     return onDelete(event);
  // }
  return onCreate(event);
}

async function onCreate(event: HandlerProperties) {
  const properties = event;/*(event.ResourceProperties as unknown) as HandlerProperties*/;
  console.log(properties);
  // await ec2.runInstances({
  //   ImageId: event.imageId
  // }).promise();
}

// async function onUpdate(event: CloudFormationCustomResourceEvent) {
//   return onCreate(event);
// }

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

onEvent({
  imageId: 'ami-047aac44951feb9fb',
  subnetId: '',
  instanceType: 't2.micro'
})
