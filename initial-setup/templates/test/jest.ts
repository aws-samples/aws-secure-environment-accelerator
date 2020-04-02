import * as cdk from '@aws-cdk/core';
import { SynthUtils } from '@aws-cdk/assert';

export interface Template {
  Resources: Record<string, Resource>;
}

export interface Resource {
  Type: string;
  Properties: { [key: string]: any };
}

export interface ResourceWithLogicalId extends Resource {
  LogicalId: string;
}

export function stackToCloudFormation(stack: cdk.Stack): Template {
  return SynthUtils.toCloudFormation(stack) as Template;
}

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
