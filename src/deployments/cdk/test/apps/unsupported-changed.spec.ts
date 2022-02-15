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

import 'jest';
import * as fs from 'fs';
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as cfnspec from '@aws-cdk/cfnspec';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { resourcesToList, ResourceWithLogicalId, ResourceProperties } from '../jest';
import { deployPhases } from './unsupported-changes.mocks';
import { phases } from '../../src/app';

/**
 * List of resource types that need to be tested for immutability.
 */
const resourceTypeNames = [
  'AWS::Budgets::Budget',
  'AWS::DirectoryService::MicrosoftAD',
  'AWS::EC2::Instance',
  'AWS::EC2::TransitGateway',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::S3::Bucket',
  'AWS::SecretsManager::Secret',
  'AWS::SecretsManager::ResourcePolicy',
];

type PropertySelector = (properties: ResourceProperties) => ResourceProperties;

/**
 * Return a copy of the given properties with only the given property names.
 */
function selectProperties(properties: ResourceProperties, propertyNames: string[]): ResourceProperties {
  return propertyNames.reduce((result, propertyName) => ({ ...result, [propertyName]: properties[propertyName] }), {});
}

/**
 * Create property selector that selects immutable properties from the given properties.
 */
function createImmutablePropertySelector(type: cfnspec.schema.ResourceType): PropertySelector {
  // Find all names of immutable properties
  const immutablePropertyNames: string[] = Object.entries(type.Properties || {})
    .filter(([_, propertySpec]) => propertySpec.UpdateType === cfnspec.schema.UpdateType.Immutable)
    .map(([propertyName, _]) => propertyName);

  // Create a closure that selects the immutable properties from the given properties
  return properties => selectProperties(properties, immutablePropertyNames);
}

const stackResources: { [stackName: string]: ResourceWithLogicalId[] } = {};

beforeAll(async () => {
  // Mock STS and S3 as the IAM logic is currently contacting S3 using the SDK
  // @ts-ignore
  jest.spyOn(STS.prototype, 'getCredentialsForAccountAndRole').mockImplementation(() => Promise.resolve(undefined));
  jest.spyOn(S3.prototype, 'getObjectBodyAsString').mockImplementation(() =>
    Promise.resolve(
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: '*',
            Resource: '*',
          },
        ],
      }),
    ),
  );
  // Mock DynamoDB as the VPC and Subnet CIDR retrival using dynamodb.scan using the SDK
  jest.spyOn(DynamoDB.prototype, 'scan').mockImplementation(() => Promise.resolve([]));

  // Deploy all phases that are defined in src/app.ts
  for await (const app of deployPhases(phases)) {
    const assembly = app.synth();
    const stacks = app.node.children.filter(cdk.Stack.isStack);
    for (const stack of stacks) {
      const artifact = assembly.getStackArtifact(stack.artifactId);
      const template = artifact.template;
      // eslint-disable-next-line deprecation/deprecation
      stackResources[stack.node.uniqueId] = resourcesToList(template.Resources);

      // Render all nested stacks
      // See https://github.com/aws/aws-cdk/blob/master/packages/@aws-cdk/assert/lib/synth-utils.ts#L52
      const nestedStacks = stack.node.findAll().filter(cdk.NestedStack.isNestedStack);
      for (const nestedStack of nestedStacks) {
        const nestedTemplateFile = path.join(assembly.directory, nestedStack.templateFile);
        const nestedTemplate = JSON.parse(fs.readFileSync(nestedTemplateFile).toString('utf-8'));
        // eslint-disable-next-line deprecation/deprecation
        stackResources[nestedStack.node.uniqueId] = resourcesToList(nestedTemplate.Resources);
      }
    }
  }
});

test.each(resourceTypeNames)('there should not be any unsupported resource changes for %s', resourceTypeName => {
  const resourceSpec = cfnspec.resourceSpecification(resourceTypeName);
  const selectProperties = createImmutablePropertySelector(resourceSpec);

  for (const [stackName, resources] of Object.entries(stackResources)) {
    // Find all resources with the given type
    const resourcesOfType = resources.filter(r => r.Type === resourceTypeName);

    // Select the relevant properties
    const expected = resourcesOfType.map(resource => ({
      LogicalId: resource.LogicalId,
      Properties: selectProperties(resource.Properties),
    }));

    // Compare the relevant properties to the snapshot
    expect(expected).toMatchSnapshot(stackName);
  }
});

// test('templates should stay exactly the same', () => {
//   for (const [stackName, resources] of Object.entries(stackResources)) {
//     // Compare the relevant properties to the snapshot
//     expect(resources).toMatchSnapshot(stackName);
//   }
// });
