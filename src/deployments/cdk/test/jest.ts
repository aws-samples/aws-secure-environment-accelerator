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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as cdk from 'aws-cdk-lib';

/**
 * Interface that represents a CloudFormation template.
 */
export interface Template {
  Resources: Record<string, Resource>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResourceProperties = { [key: string]: any };

/**
 * Interface that represents a CloudFormation resource.
 */
export interface Resource {
  Type: string;
  Properties: ResourceProperties;
}

/**
 * Interface that is used as return value of `resourcesToList`.
 */
export interface ResourceWithLogicalId extends Resource {
  LogicalId: string;
}

/**
 * Convert a CDK stack to a CloudFormation template.
 *
 * @param stack
 */
export function stackToCloudFormation(stack: cdk.Stack): Template {
  const template = cdk.assertions.Template.fromStack(stack);
  return template.toJSON() as Template;
}

/**
 * Auxiliary method to convert a CloudFormation `Resources` object to to a list to simplify testing.
 *
 * ```
 * {
 *   VpcAbc: {
 *     Type: 'AWS::EC2::VPC',
 *     Properties: {
 *       CidrBlock: '10.0.1.0/24'
 *     }
 *   }
 * }
 * ```
 * becomes
 * ```
 * [
 *   {
 *     LogicalId: 'VpcAbc',
 *     Type: 'AWS::EC2::VPC',
 *     Properties: {
 *       CidrBlock: '10.0.1.0/24'
 *     }
 *   }
 * ]
 * @param object
 */
export function resourcesToList(object: Record<string, Resource> | undefined): ResourceWithLogicalId[] {
  if (!object) {
    return [];
  }
  const result = [];
  for (const key of Object.keys(object)) {
    const value = object[key];
    result.push({
      ...value,
      LogicalId: key,
    });
  }
  return result;
}
