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

export function createLogGroupName(name: string, service?: string): string {
  const groupName = createName({
    name,
    service,
    separator: '/',
  });
  return `/${groupName}`;
}

export function createRoleName(name: string, suffixLength: number = 8): string {
  return createName({
    name,
    suffixLength,
  });
}

export function createEncryptionKeyName(name: string): string {
  return createName({
    name,
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
  /**
   * @default undefined
   */
  service?: string;
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
      const { name, account, region, suffixLength, service } = props;
      const separator = props.separator || DEFAULT_SEPARATOR;
      // Find the AcceleratorStack in the parents.
      const parents = scope.node.scopes;
      const stack = parents.find((p: cdk.IConstruct): p is AcceleratorStack => p instanceof AcceleratorStack);
      if (!stack) {
        throw new Error(`The AcceleratorNameGenerator should only be used with constructs in AcceleratorStack`);
      }

      // Use the AcceleratorStack prefix
      let prefix: string;
      if (separator && separator !== DEFAULT_SEPARATOR && stack.acceleratorPrefix.endsWith(DEFAULT_SEPARATOR)) {
        // if separator != DEFAULT_SEPARATOR then remove DEFAULT_SEPARATOR from prefix if that ends with DEFAULT_SEPARATOR and append new seperator
        // eg. Prefix- turns to be Prefix/ considering separator = / and DEFAULT_SEPARATOR = -
        prefix = `${stack.acceleratorPrefix.slice(0, -1)}${separator}`;
      } else {
        prefix = stack.acceleratorPrefix;
      }

      const pieces = [];
      if (account) {
        pieces.push(cdk.Aws.ACCOUNT_ID);
      }
      if (region) {
        pieces.push(cdk.Aws.REGION);
      }
      if (service) {
        pieces.push(prepareString(service, props));
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
  const hash = crypto.createHash('md5').update(path.join('/')).digest('hex');
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
