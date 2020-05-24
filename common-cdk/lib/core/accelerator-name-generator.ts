import * as crypto from 'crypto';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack } from './accelerator-stack';

/**
 * READ THIS BEFORE MODIFYING THIS FUNCTION: Changes made to this function will most likely create new bucket names for
 * resources in a customer's account. Please take this into account!
 */
export function createBucketName(name?: string): string {
  return createName({
    name,
    account: true,
    region: true,
    suffixLength: 8,
    lowercase: true,
  });
}

/**
 * READ THIS BEFORE MODIFYING THIS FUNCTION: Changes made to this function will most likely create new bucket names for
 * resources in a customer's account. Please take this into account!
 *
 * Creates a fixed bucket name that can be used across accounts. The given properties *have to be* resolved properties,
 * otherwise the bucket name *cannot* be used across accounts!
 */
export function createFixedBucketName(props: {
  acceleratorPrefix: string;
  accountId: string;
  region: string;
  name?: string;
  seed?: string;
}): string {
  return createFixedName({
    ...props,
    suffixLength: 8,
    lowercase: true,
  });
}

export function createRoleName(name: string, suffixLength: number = 8): string {
  return createName({
    name,
    suffixLength,
  });
}

export function createFixedRoleName(props: {
  acceleratorPrefix: string;
  name?: string;
  seed?: string;
  suffixLength?: number;
}): string {
  return createFixedName({
    ...props,
    suffixLength: props.suffixLength ?? 8,
  });
}

export function createEncryptionKeyName(name: string): string {
  return createName({
    name,
    suffixLength: 8,
  });
}

export function createFixedEncryptionKeyName(props: {
  acceleratorPrefix: string;
  name?: string;
  seed?: string;
}): string {
  return createFixedName({
    ...props,
    suffixLength: 8,
  });
}

export function createKeyPairName(name: string): string {
  return createName({
    name,
    suffixLength: 8,
  });
}

const DEFAULT_SEPARATOR = '-';

export interface FixedBucketNameGeneratorProps {
  acceleratorPrefix: string;
  /**
   * @default undefined
   */
  seed?: string;
  /**
   * @default undefined
   */
  accountId?: string;
  /**
   * @default undefined
   */
  region?: string;
  /**
   * @default undefined
   */
  suffixLength?: number;
  /**
   * @default '-'
   */
  separator?: string;
  /**
   * @default undefined
   */
  name?: string;
  /**
   * @default false
   */
  lowercase?: boolean;
}

/**
 * READ THIS BEFORE MODIFYING THIS FUNCTION: Changes made to this function will most likely create new bucket names for
 * resources in a customer's account. Please take this into account!
 */
export function createFixedName(props: FixedBucketNameGeneratorProps) {
  // Verify that all properties are resolved values
  Object.entries(props).forEach(([name, value]) => {
    if (value && cdk.Token.isUnresolved(value)) {
      throw new Error(`Property '${name}' cannot be an unresolved value: ${value}`);
    }
  });

  const { acceleratorPrefix, name, seed, accountId, region, suffixLength, separator = DEFAULT_SEPARATOR } = props;

  const pieces = [];
  if (accountId) {
    pieces.push(accountId);
  }
  if (region) {
    pieces.push(region);
  }
  if (name) {
    pieces.push(prepareString(name, props));
  }
  if (suffixLength && suffixLength > 0) {
    // Create a suffix that is based on the path of the component
    const path = [accountId, region, seed, name].filter((s): s is string => !!s);
    const suffix = hashPath(path, suffixLength);
    pieces.push(prepareString(suffix, props));
  }
  return prepareString(acceleratorPrefix, props) + pieces.join(separator);
}

export interface CreateNameProps {
  /**
   * @default undefined
   */
  suffixLength?: number;
  /**
   * @default '-'
   */
  separator?: string;
  /**
   * @default false
   */
  account?: boolean;
  /**
   * @default false
   */
  region?: boolean;
  /**
   * @default undefined
   */
  name?: string;
  /**
   * @default false
   */
  lowercase?: boolean;
}

/**
 * READ THIS BEFORE MODIFYING THIS FUNCTION: Changes made to this function will most likely create new bucket names for
 * resources in a customer's account. Please take this into account!
 *
 * Generates a name with the Accelerator prefix of the AcceleratorStack, the given name and a random prefix based on
 * the constructs path.
 *
 * @param name
 */
export function createName(props: CreateNameProps = {}): string {
  return cdk.Lazy.stringValue({
    produce: (context: cdk.IResolveContext) => {
      const { scope } = context;
      const { name, account, region, suffixLength, separator = DEFAULT_SEPARATOR } = props;

      // Find the AcceleratorStack in the parents.
      const parents = scope.node.scopes;
      const stack = parents.find((p: cdk.IConstruct): p is AcceleratorStack => p instanceof AcceleratorStack);
      if (!stack) {
        throw new Error(`The AcceleratorNameGenerator should only be used with constructs in AcceleratorStack`);
      }

      // Use the AcceleratorStack prefix
      const prefix = stack.acceleratorPrefix;

      const pieces = [];
      if (account) {
        pieces.push(cdk.Aws.ACCOUNT_ID);
      }
      if (region) {
        pieces.push(cdk.Aws.REGION);
      }
      if (name) {
        pieces.push(prepareString(name, props));
      }
      if (suffixLength && suffixLength > 0) {
        // Create a suffix that is based on the path of the component
        const path = parents.map(p => p.node.id);
        const suffix = hashPath(path, suffixLength);
        pieces.push(prepareString(suffix, props));
      }

      return prepareString(prefix, props) + pieces.join(separator);
    },
  });
}

/**
 * Based on `makeUniqueId`
 *
 * https://github.com/aws/aws-cdk/blob/f8df4e04f6f9631f963353903e020cfa8377e8bc/packages/%40aws-cdk/core/lib/private/uniqueid.ts#L33
 */
function hashPath(path: string[], length: number) {
  const hash = crypto
    .createHash('md5')
    .update(path.join('/'))
    .digest('hex');
  return hash.slice(0, length).toUpperCase();
}

/**
 * Prepare the given string with the given props. Currently only lowercases the string.
 */
function prepareString(str: string, props: { lowercase?: boolean }): string {
  if (cdk.Token.isUnresolved(str)) {
    // We should not modify an unresolved token
    return str;
  } else if (props.lowercase) {
    return str.toLowerCase();
  }
  return str;
}
