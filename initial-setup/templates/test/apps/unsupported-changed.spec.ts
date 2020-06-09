import 'jest';
import * as cdk from '@aws-cdk/core';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { resourcesToList, stackToCloudFormation, ResourceWithLogicalId, ResourceProperties } from '../jest';
import { deployPhases } from './unsupported-changes.mocks';
import { phases } from '../../src/app';

type ResourcePropertySelector = (resource: ResourceWithLogicalId) => Partial<ResourceWithLogicalId>;

type UnsupportedChangeEntry = [string, ResourcePropertySelector];

/**
 * Returns a ResourceMatcher that matches all properties in a resource.
 */
const matchAllResourceProperties: ResourcePropertySelector = resource => ({
  LogicalId: resource.LogicalId,
  Properties: resource.Properties,
});

/**
 * Returns a ResourceMatcher for the given property names.
 */
function matchResourceProperties(propertyNames: string[]): ResourcePropertySelector {
  return resource => ({
    LogicalId: resource.LogicalId,
    Properties: selectKeys(resource.Properties, propertyNames),
  });
}

/**
 * Returns an object containing all the given properties of the given properties object.
 */
function selectKeys(properties: ResourceProperties, propertyNames: string[]): ResourceProperties {
  return propertyNames.reduce((result, propertyName) => {
    return {
      ...result,
      [propertyName]: properties[propertyName],
    };
  }, {});
}

/**
 * List of unsupported changes per resource type.
 */
const UNSUPPORTED_CHANGES: UnsupportedChangeEntry[] = [
  ['AWS::S3::Bucket', matchResourceProperties(['BucketName'])],
  ['AWS::DirectoryService::MicrosoftAD', matchAllResourceProperties],
  ['AWS::SecretsManager::Secret', matchResourceProperties(['Name'])],
  [
    'AWS::EC2::Instance',
    matchResourceProperties([
      'AvailabilityZone',
      'CpuOptions',
      'ElasticGpuSpecifications',
      'ElasticInferenceAccelerators',
      'HibernationOptions',
      'HostResourceGroupArn',
      'ImageId',
      'InstanceType',
      'Ipv6AddressCount',
      'Ipv6Addresses',
      'KeyName',
      'LicenseSpecifications',
      'NetworkInterfaces',
      'PlacementGroupName',
      'PrivateIpAddress',
      'SecurityGroups',
      'SubnetId',
    ]),
  ],
];

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

  const app = new cdk.App();

  // Deploy all phases that are defined in src/app.ts
  await deployPhases(app, phases);

  // Convert the stacks to CloudFormation resources
  const stacks = app.node.children.filter(child => child instanceof cdk.Stack) as cdk.Stack[];
  for (const stack of stacks) {
    const template = stackToCloudFormation(stack);
    const resources = resourcesToList(template.Resources);

    stackResources[stack.stackName] = resources;
  }
});

test.each(UNSUPPORTED_CHANGES)(
  'there should not be any unsupported resource changes for %s',
  (resourceType, resourcePropertySelector) => {
    for (const [stackName, resources] of Object.entries(stackResources)) {
      // Find all resources with the given type
      const resourcesOfType = resources.filter(r => r.Type === resourceType);
      // Select the relevant properties
      const expected = resourcesOfType.map(resourcePropertySelector);

      // Compare the relevant properties to the snapshot
      expect(expected).toMatchSnapshot(stackName);
    }
  },
);
