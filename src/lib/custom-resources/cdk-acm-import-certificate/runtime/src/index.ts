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
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { addCustomResourceTags } from '@aws-accelerator/custom-resource-runtime-cfn-tags';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export type TagList = AWS.ACM.TagList;

export interface HandlerProperties {
  certificateBucketName: string;
  certificateBucketPath: string;
  privateKeyBucketName: string;
  privateKeyBucketPath: string;
  certificateChainBucketName?: string;
  certificateChainBucketPath?: string;
  ignoreLimitExceededException?: boolean;
  tags?: TagList;
}

export const handler = errorHandler(onEvent);

const acm = new AWS.ACM();
const s3 = new AWS.S3();

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Importing certificate...`);
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

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const response = await importCertificate(event);
  return {
    physicalResourceId: response,
    data: {
      CertificateArn: response,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const response = await importCertificate(event);
  return {
    physicalResourceId: response,
    data: {
      CertificateArn: response,
    },
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  await throttlingBackOff(() =>
    acm
      .deleteCertificate({
        CertificateArn: event.PhysicalResourceId,
      })
      .promise(),
  );
}

async function importCertificate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = getPropertiesFromEvent(event);
  const physicalResourceId = 'PhysicalResourceId' in event ? event.PhysicalResourceId : undefined;

  // Tagging is not permitted on re-import
  const tags = physicalResourceId ? undefined : addCustomResourceTags(properties.tags, event);

  // TODO Handle manual deletion of a certificate
  //  Check if certificate with ARN `physicalResourceId` exists

  try {
    const certificate = await getS3Body(properties.certificateBucketName, properties.certificateBucketPath);
    const privateKey = await getS3Body(properties.privateKeyBucketName, properties.privateKeyBucketPath);
    const certificateChain = await getOptionalS3Body(
      properties.certificateChainBucketName,
      properties.certificateChainBucketPath,
    );
    const response = await throttlingBackOff(() =>
      acm
        .importCertificate({
          Certificate: certificate,
          PrivateKey: privateKey,
          CertificateChain: certificateChain,
          CertificateArn: physicalResourceId,
          Tags: tags,
        })
        .promise(),
    );
    return response.CertificateArn!;
  } catch (e) {
    if (e.code === 'LimitExceededException' && properties.ignoreLimitExceededException === true) {
      console.warn(`Ignoring limit exceeded exception`);
      return physicalResourceId || 'LimitExceeded';
    } else {
      throw e;
    }
  }
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (typeof properties.ignoreLimitExceededException === 'string') {
    properties.ignoreLimitExceededException = properties.ignoreLimitExceededException === 'true';
  }
  return properties;
}

async function getOptionalS3Body(bucketName?: string, bucketPath?: string) {
  if (bucketName && bucketPath) {
    return getS3Body(bucketName, bucketPath);
  }
}

async function getS3Body(bucketName: string, bucketPath: string) {
  try {
    const object = await throttlingBackOff(() =>
      s3
        .getObject({
          Bucket: bucketName,
          Key: bucketPath,
        })
        .promise(),
    );
    return object.Body!;
  } catch (e) {
    throw new Error(`Unable to load S3 file s3://${bucketName}/${bucketPath}: ${e}`);
  }
}
