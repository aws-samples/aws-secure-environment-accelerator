import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import { send, SUCCESS, FAILED } from 'cfn-response-async';

interface HandlerProperties {
  sleep: number;
}

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Sleeping...`);
  console.log(JSON.stringify(event, null, 2));

  try {
    const data = await onEvent(event);
    console.debug('Sending successful response');
    console.debug(JSON.stringify(data, null, 2));
    await send(event, context, SUCCESS, data);
  } catch (e) {
    console.error('Sending failure response');
    console.error(e);
    await send(event, context, FAILED);
  }
};

const onEvent = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
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
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  // Use setTimeout to sleep the given amount of milliseconds
  return new Promise(resolve => setTimeout(resolve, properties.sleep));
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
