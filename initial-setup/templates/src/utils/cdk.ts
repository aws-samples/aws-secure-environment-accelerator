import * as cdk from '@aws-cdk/core';

export function overrideLogicalId(construct: cdk.Construct, logicalId: string) {
  const cfnResource = findCfnResource(construct);
  const sanitized = logicalId.replace(/[^a-zA-Z0-9+]+/gi, '');
  cfnResource.overrideLogicalId(sanitized);
}

export function findCfnResource(construct: cdk.Construct): cdk.CfnResource {
  if (construct instanceof cdk.CfnResource) {
    return construct;
  }
  for (const child of construct.node.children) {
    if (child instanceof cdk.CfnResource) {
      return child;
    }
  }
  throw new Error(`Cannot find CfnResource for construct ${construct.toString()}`);
}
