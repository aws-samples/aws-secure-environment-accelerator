import 'jest';
import * as cdk from '@aws-cdk/core';
import * as cfnspec from '@aws-cdk/cfnspec';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { resourcesToList, stackToCloudFormation, ResourceWithLogicalId, ResourceProperties } from '../jest';
import { deployPhases } from './unsupported-changes.mocks';
import { phases } from '../../src/app';

/**
 * List of resource types that need to be tested for immutability.
 */
const resourceTypeNames = [
  'AWS::Budgets::Budget',
  'AWS::DirectoryService::MicrosoftAD',
  'AWS::EC2::Instance',
  'AWS::S3::Bucket',
  'AWS::SecretsManager::Secret',
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

  // Deploy all phases that are defined in src/app.ts
  for await (const app of deployPhases(phases)) {
    // Convert the stacks to CloudFormation resources
    const stacks = app.node.children.filter(child => child instanceof cdk.Stack) as cdk.Stack[];
    for (const stack of stacks) {
      const template = stackToCloudFormation(stack);
      const resources = resourcesToList(template.Resources);

      stackResources[stack.stackName] = resources;
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
