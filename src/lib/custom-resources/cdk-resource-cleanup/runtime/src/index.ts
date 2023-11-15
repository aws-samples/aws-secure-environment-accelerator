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
import { CloudFormation } from '@aws-sdk/client-cloudformation';
import { Route53 } from '@aws-sdk/client-route-53';
import { Route53Resolver } from '@aws-sdk/client-route53resolver';

import {
  ListObjectsV2CommandOutput,
  ListObjectVersionsCommandOutput,
  Object,
  ObjectIdentifier,
  ObjectVersion,
  S3,
} from '@aws-sdk/client-s3';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff, delay } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  bucketName?: string;
  rulesDomainNames?: string[];
  phzDomainNames?: string[];
  cdkStackName?: string;
}

const s3 = new S3({
  logger: console,
});
const route53 = new Route53({
  logger: console,
});
const route53Resolver = new Route53Resolver({
  logger: console,
});
const cloudFormation = new CloudFormation({
  logger: console,
});

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Deletes resources based on input properties...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return;
  }
}

async function onCreateOrUpdate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { bucketName, rulesDomainNames, phzDomainNames, cdkStackName } = properties;

  // If bucket name exists, deleting the attached bucket policy
  if (bucketName) {
    await throttlingBackOff(() =>
      s3
        .deleteBucketPolicy({
          Bucket: bucketName,
        }),
    );
  }

  // If resolver rules domain names exists, delete resolver rules
  // w.r.t to the domain names
  for (const domain of rulesDomainNames || []) {
    const resolverRuleIds = await getResolverRuleIds(domain);
    for (const ruleId of resolverRuleIds || []) {
      let vpcIds = await getVpcIds(ruleId);
      for (const vpcId of vpcIds || []) {
        try {
          await throttlingBackOff(() =>
            route53Resolver
              .disassociateResolverRule({
                ResolverRuleId: ruleId,
                VPCId: vpcId,
              }),
          );
        } catch (error) {
          console.warn(error);
        }
      }

      do {
        vpcIds = await getVpcIds(ruleId);
        // Waiting to disassociate VPC Ids from the resolver rule
        await delay(5000);
      } while ((vpcIds || []).length > 0);

      // Deleting resolver rule after disassociation of VPC Ids
      try {
        await throttlingBackOff(() =>
          route53Resolver
            .deleteResolverRule({
              ResolverRuleId: ruleId,
            }),
        );
      } catch (error) {
        console.warn(error);
      }
    }
  }

  // If private hosted zones domain names exists, delete private hosted zones
  // w.r.t to the domain names
  for (const domain of phzDomainNames || []) {
    const privateHostedZone = await throttlingBackOff(() =>
      route53
        .listHostedZonesByName({
          DNSName: domain,
        }),
    );
    const hostedZoneIds = privateHostedZone.HostedZones.filter(p => p.Name === domain);

    for (const zoneId of hostedZoneIds) {
      try {
        await throttlingBackOff(() =>
          route53
            .deleteHostedZone({
              Id: zoneId.Id,
            }),
        );
      } catch (error) {
        console.warn(error);
      }
    }
  }

  // Empty the S3 bucket and delete the CDKToolkit Bootstrap stack
  if (cdkStackName) {
    try {
      const stack = await throttlingBackOff(() =>
        cloudFormation
          .describeStacks({
            StackName: cdkStackName,
          }),
      );

      if (stack && stack.Stacks) {
        const cdkStack = stack.Stacks[0];
        if (cdkStack.Outputs) {
          const outputs = cdkStack.Outputs;
          const bucketName = outputs.find(o => o.OutputKey === 'BucketName')?.OutputValue;
          console.log('bucketName', bucketName);
          if (bucketName) {
            if (await bucketExists(bucketName)) {
              // Suspend versioning
              await throttlingBackOff(() =>
                s3
                  .putBucketVersioning({
                    Bucket: bucketName,
                    VersioningConfiguration: {
                      Status: 'Suspended',
                    },
                  }),
              );

              // Deleting all objects in the s3 bucket
              await deleteS3Objects(bucketName);

              // Deleting all object versions in the s3 bucket
              await deleteS3Versions(bucketName);

              // Deleting all object markers in the s3 bucket
              await deleteS3Markers(bucketName);

              // Deleting the bucket
              await throttlingBackOff(() =>
                s3
                  .deleteBucket({
                    Bucket: bucketName,
                  }),
              );
              console.log(`successfully deleted bucket ${bucketName}`);
            }
          }
          await cloudFormation
            .deleteStack({
              StackName: cdkStackName,
            });
          console.log(`successfully deleted stack cdk-stack-delete-test`);
        }
      }
    } catch (error) {
      console.warn(`skipping deletion of stack ${error}`);
    }
  }
}

async function bucketExists(bucketName: string): Promise<boolean> {
  try {
    await throttlingBackOff(() =>
      s3
        .headBucket({
          Bucket: bucketName,
        }),
    );
  } catch (e) {
    return false;
  }
  return true;
}

async function deleteS3Objects(bucketName: string): Promise<void> {
  const deleteObjects: Array<ObjectIdentifier> = await listObjectsList(bucketName);
  for (const deleteChunk of chunk(deleteObjects, 1000)) {
    console.log('deleteObjects', deleteChunk.length);
    await throttlingBackOff(() =>
      s3
        .deleteObjects({
          Bucket: bucketName,
          Delete: {
            Objects: deleteChunk,
          },
        }),
    );
  }

  do {
    console.log('waiting for deletion of s3 objects');
    await sleep(2000);
  } while ((await listObjectsList(bucketName)).length > 0);
  console.log('successfully deleted all objects');
}

async function listObjectsList(bucketName: string): Promise<Array<ObjectIdentifier>> {
  const listFiles = listObjects(bucketName);
  const deleteObjects: Array<ObjectIdentifier> = [];
  for await (const object of listFiles) {
    // console.debug(`Deleting object ${object.Key}`);
    if (object.Key) {
      deleteObjects.push({ Key: object.Key });
    }
  }
  return deleteObjects;
}

async function* listObjects(bucketName: string): AsyncIterableIterator<Object> {
  let nextContinuationToken: string | undefined;
  do {
    const listObjects: ListObjectsV2CommandOutput = await throttlingBackOff(() =>
      s3
        .listObjectsV2({
          Bucket: bucketName,
          ContinuationToken: nextContinuationToken,
        }),
    );
    nextContinuationToken = listObjects.NextContinuationToken;
    if (listObjects.Contents) {
      yield* listObjects.Contents;
    }
  } while (nextContinuationToken);
}

async function deleteS3Markers(bucketName: string): Promise<void> {
  const deleteObjectMarkers: Array<ObjectIdentifier> = await listObjectMarkersList(bucketName);
  console.log('deleteS3Markers length', deleteObjectMarkers.length);
  for (const deleteChunk of chunk(deleteObjectMarkers, 1000)) {
    console.log('Deleting marker chunk', deleteChunk.length);
    await throttlingBackOff(() =>
      s3
        .deleteObjects({
          Bucket: bucketName,
          Delete: {
            Objects: deleteChunk,
          },
        }),
    );
  }

  do {
    console.log('waiting for deletion of s3 markers');
    await sleep(2000);
  } while ((await listObjectMarkersList(bucketName)).length > 0);
  console.log('successfully deleted all marker');
}

async function listObjectMarkersList(bucketName: string): Promise<Array<ObjectIdentifier>> {
  const listMarkers = listObjectMarkers(bucketName);
  const deleteObjectMarkers: Array<ObjectIdentifier> = [];
  for await (const object of listMarkers) {
    if (object.Key) {
      deleteObjectMarkers.push({
        Key: object.Key,
        VersionId: object.VersionId,
      });
    }
  }
  return deleteObjectMarkers;
}

async function* listObjectMarkers(bucketName: string): AsyncIterableIterator<ObjectVersion> {
  let nextContinuationMarker: string | undefined;
  do {
    const listMarkers: ListObjectVersionsCommandOutput = await throttlingBackOff(() =>
      s3
        .listObjectVersions({
          Bucket: bucketName,
          MaxKeys: 500,
          KeyMarker: nextContinuationMarker,
        }),
    );

    nextContinuationMarker = listMarkers.NextKeyMarker;
    if (listMarkers.DeleteMarkers) {
      yield* listMarkers.DeleteMarkers;
    }
  } while (nextContinuationMarker);
}

async function deleteS3Versions(bucketName: string): Promise<void> {
  const deleteObjectVersions: Array<ObjectIdentifier> = await listObjectVersionsList(bucketName);
  console.log('deleteObjectVersions length', deleteObjectVersions.length);
  for (const deleteChunk of chunk(deleteObjectVersions, 1000)) {
    console.log('Deleting version chunk', deleteChunk.length);
    await throttlingBackOff(() =>
      s3
        .deleteObjects({
          Bucket: bucketName,
          Delete: {
            Objects: deleteChunk,
          },
        }),
    );
  }

  do {
    console.log('waiting for deletion of s3 versions');
    await sleep(2000);
  } while ((await listObjectVersionsList(bucketName)).length > 0);
  console.log('successfully deleted all versions');
}

async function listObjectVersionsList(bucketName: string): Promise<Array<ObjectIdentifier>> {
  const listVersions = listObjectVersions(bucketName);
  const deleteObjectVersions: Array<ObjectIdentifier> = [];
  for await (const object of listVersions) {
    if (object.Key) {
      deleteObjectVersions.push({
        Key: object.Key,
        VersionId: object.VersionId,
      });
    }
  }
  return deleteObjectVersions;
}

async function* listObjectVersions(bucketName: string): AsyncIterableIterator<ObjectVersion> {
  let nextContinuationVersion: string | undefined;
  do {
    const listVersions: ListObjectVersionsCommandOutput = await throttlingBackOff(() =>
      s3
        .listObjectVersions({
          Bucket: bucketName,
          MaxKeys: 500,
          KeyMarker: nextContinuationVersion,
        }),
    );

    nextContinuationVersion = listVersions.NextKeyMarker;
    if (listVersions.Versions) {
      yield* listVersions.Versions;
    }
  } while (nextContinuationVersion);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function chunk(arr: Array<ObjectIdentifier>, size: number): Array<ObjectIdentifier>[] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
}

async function getVpcIds(resolverRuleId: string) {
  // Get the vpc associations for the resolver
  try {
    const associations = await throttlingBackOff(() =>
      route53Resolver
        .listResolverRuleAssociations({
          Filters: [
            {
              Name: 'ResolverRuleId',
              Values: [resolverRuleId],
            },
          ],
        }),
    );

    const vpcIds = associations.ResolverRuleAssociations?.map(a => a.VPCId);
    return vpcIds;
  } catch (error) {
    console.warn(error);
  }
}

async function getResolverRuleIds(domain: string) {
  // Get the resolver rule details for the domain
  try {
    const resolverRule = await throttlingBackOff(() =>
      route53Resolver
        .listResolverRules({
          Filters: [
            {
              Name: 'DomainName',
              Values: [domain],
            },
          ],
        }),
    );
    return resolverRule.ResolverRules?.map(r => r.Id);
  } catch (error) {
    console.warn(error);
  }
}
