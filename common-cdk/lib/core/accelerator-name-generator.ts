import * as crypto from 'crypto';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack } from './accelerator-stack';

export function createBucketName(name?: string): string {
  return createName({
    name,
    account: true,
    region: true,
    suffixLength: 8,
    lowercase: true,
  });
}

export function createRoleName(name: string): string {
  return createName({
    name,
    suffixLength: 8,
  });
}

export function createEncryptionKeyName(name: string): string {
  return createName({
    name,
    account: true,
    region: true,
    suffixLength: 8,
    lowercase: true,
  });
}

export function createKeyPairName(name: string): string {
  return createName({
    name,
    account: true,
    region: true,
    suffixLength: 8,
    lowercase: true,
  });
}

const DEFAULT_SEPARATOR = '-';

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
   * @default false
   */
  name?: string;
  /**
   * @default false
   */
  lowercase?: boolean;
}

/**
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
      if (suffixLength) {
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
function prepareString(str: string, props: CreateNameProps): string {
  if (cdk.Token.isUnresolved(str)) {
    // We should not modify an unresolved token
    return str;
  } else if (props.lowercase) {
    return str.toLowerCase();
  }
  return str;
}
