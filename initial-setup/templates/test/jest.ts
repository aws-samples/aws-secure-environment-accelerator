// tslint:disable:no-any
import * as cdk from '@aws-cdk/core';
import { SynthUtils } from '@aws-cdk/assert';

/**
 * Interface that represents a CloudFormation template.
 */
export interface Template {
  Resources: Record<string, Resource>;
}

/**
 * Interface that represents a CloudFormation resource.
 */
export interface Resource {
  Type: string;
  Properties: { [key: string]: any };
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
  return SynthUtils.toCloudFormation(stack) as Template;
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
export function resourcesToList(object: Record<string, Resource>): ResourceWithLogicalId[] {
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
