import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import { send, SUCCESS, FAILED } from 'cfn-response-async';

export type TemplateParameters = { [key: string]: string };

export interface HandlerProperties {
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

export const onEvent = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
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

// onCreate({
//   ResourceType: '',
//   ResponseURL: '',
//   ServiceToken: '',
//   StackId: '',
//   LogicalResourceId: '',
//   RequestId: '',
//   RequestType: 'Create',
//   ResourceProperties: {
//     ServiceToken: '',
//     templateBucketName: 'pbmmaccel-perimeter-phase2-firewallconfigf80ac734-f9h0eskk1mlt',
//     templatePath: 'fortigate.txt',
//     outputBucketName: 'pbmmaccel-perimeter-phase2-firewallconfigf80ac734-f9h0eskk1mlt',
//     outputPath: 'fgtconfig-init-FgtA-0.txt',
//     parameters: {
//       '${Hostname}': 'FgtA',
//       '${VpcMask}': '255.255.254.0',
//       '${VpcCidr}': '100.96.250.0/23',
//       '${VpcNetworkIp}': '100.96.250.0',
//       '${VpcRouterIp}': '100.96.250.1',
//       '${PublicNetworkIp}': '100.96.251.64',
//       '${PublicRouterIp}': '100.96.251.65',
//       '${PublicCidr}': '100.96.251.64/26',
//       '${PublicMask}': '255.255.255.192',
//       '${PublicCgwTunnelOutsideAddress1}': '35.182.44.198',
//       '${PublicCgwTunnelInsideAddress1}': '169.254.25.46',
//       '${PublicCgwBgpAsn1}': '63000',
//       '${PublicVpnTunnelOutsideAddress1}': '35.182.31.119',
//       '${PublicVpnTunnelInsideAddress1}': '169.254.25.45',
//       '${PublicVpnBgpAsn1}': '64512',
//       '${PublicPreSharedSecret1}': 'yTHR4PMEE7GQJr8dnC4JsIgX9eXMpPUt',
//       '${OnPremiseNetworkIp}': '100.96.251.0',
//       '${OnPremiseRouterIp}': '100.96.251.1',
//       '${OnPremiseCidr}': '100.96.251.0/28',
//       '${OnPremiseMask}': '255.255.255.240',
//       '${FWMgmtNetworkIp}': '100.96.251.16',
//       '${FWMgmtRouterIp}': '100.96.251.17',
//       '${FWMgmtCidr}': '100.96.251.16/28',
//       '${FWMgmtMask}': '255.255.255.240',
//       '${ProxyNetworkIp}': '100.96.250.0',
//       '${ProxyRouterIp}': '100.96.250.1',
//       '${ProxyCidr}': '100.96.250.0/25',
//       '${ProxyMask}': '255.255.255.128',
//     },
//   },
// });
