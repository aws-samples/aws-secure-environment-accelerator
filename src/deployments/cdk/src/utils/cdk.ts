import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';

export function overrideLogicalId(construct: cdk.Construct, logicalId: string) {
  const bucket = findChildOfType(s3.CfnBucket, construct);
  const sanitized = logicalId.replace(/[^a-zA-Z0-9+]+/gi, '');
  bucket.overrideLogicalId(sanitized);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Type<T> = new (...args: any[]) => T;

export function findChildOfType<T>(type: Type<T>, construct: cdk.Construct): T {
  if (construct instanceof type) {
    return construct;
  }
  for (const child of construct.node.children) {
    if (child instanceof type) {
      return child;
    }
  }
  throw new Error(`Cannot find child of type ${type} in construct ${construct.toString()}`);
}
