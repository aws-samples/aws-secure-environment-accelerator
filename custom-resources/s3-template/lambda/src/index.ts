import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import { send, SUCCESS, FAILED } from 'cfn-response-async';

type TemplateParameters = { [key: string]: string };

interface HandlerProperties {
  templateBucketName: string;
  templatePath: string;
  outputBucketName: string;
  outputPath: string;
  parameters: TemplateParameters;
}

const s3 = new AWS.S3();

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Creating S3 object from template...`);
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

  // Load template
  console.debug(`Loading template ${properties.templateBucketName}/${properties.templatePath}`);
  const object = await s3
    .getObject({
      Bucket: properties.templateBucketName,
      Key: properties.templatePath,
    })
    .promise();
  const body = object.Body!;
  const bodyString = body.toString();

  // Replace variables
  let replaced = bodyString;
  for (const [key, value] of Object.entries(properties.parameters)) {
    replaced = replaceAll(replaced, key, value);
  }

  // Save the template with replacements to S3
  console.debug(`Saving output ${properties.outputBucketName}/${properties.outputPath}`);
  await s3
    .putObject({
      Bucket: properties.outputBucketName,
      Key: properties.outputPath,
      Body: Buffer.from(replaced),
    })
    .promise();
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

function replaceAll(str: string, needle: string, replacement: string) {
  let index = 0;
  let replaced = str;
  while (true) {
    index = str.indexOf(needle, index + 1);
    if (index === -1) {
      break;
    }
    replaced = replaced.replace(needle, replacement);
  }
  return replaced;
}
