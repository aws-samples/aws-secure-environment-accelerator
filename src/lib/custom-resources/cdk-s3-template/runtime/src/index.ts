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
import { S3, waitUntilObjectExists } from '@aws-sdk/client-s3';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export type TemplateParameters = { [key: string]: string };

export interface HandlerProperties {
  templateBucketName: string;
  templatePath: string;
  outputBucketName: string;
  outputPath: string;
  parameters: TemplateParameters;
}

const s3 = new S3({
  logger: console,
});

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating S3 object from template...`);
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

export const handler = errorHandler(onEvent);

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { templateBucketName, templatePath, outputBucketName, outputPath } = properties;

  // Load template
  console.debug(`Loading template ${templateBucketName}/${templatePath}`);
  let bodyString;
  try {
    const object = await throttlingBackOff(() =>
      s3
        .getObject({
          Bucket: properties.templateBucketName,
          Key: properties.templatePath,
        }),
    );
    const body = object.Body!;
    bodyString = body.toString();
  } catch (e) {
    throw new Error(`Unable to get S3 object s3://${templateBucketName}/${templatePath}: ${e}`);
  }

  // Replace variables
  let replaced = bodyString;
  for (const [key, value] of Object.entries(properties.parameters)) {
    replaced = replaceAll(replaced, key, value);
  }

  try {
    // Save the template with replacements to S3
    console.debug(`Saving output ${outputBucketName}/${outputPath}`);
    await throttlingBackOff(() =>
      s3
        .putObject({
          Bucket: outputBucketName,
          Key: outputPath,
          Body: Buffer.from(replaced),
        }),
    );
  } catch (e) {
    throw new Error(`Unable to put S3 object s3://${outputBucketName}/${outputPath}: ${e}`);
  }

  try {
    // Waiting for the template available in s3
    // default delay is 5 seconds and max retry attempts is 20
    console.debug(`Waiting for ${outputBucketName}/${outputPath}`);
    await throttlingBackOff(() =>
      waitUntilObjectExists({
        client: s3,
        maxWaitTime: 20,
      }, {
        Bucket: outputBucketName,
        Key: outputPath,
      }),
    );
  } catch (error) {
    throw new Error(`Unable to find S3 object s3://${outputBucketName}/${outputPath}: ${error}`);
  }
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
