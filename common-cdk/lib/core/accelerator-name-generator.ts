import * as crypto from 'crypto';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack } from './accelerator-stack';

const DEFAULT_SUFFIX_LENGTH = 8;
const DEFAULT_SEPARATOR = '-';

export interface PrefixNameProps {
  /**
   * @default 8
   */
  suffixLength?: number;
  /**
   * @default '-'
   */
  separator?: string;
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
export function createName(name: string, props: PrefixNameProps = {}): string {
  return cdk.Lazy.stringValue({
    produce: (context: cdk.IResolveContext) => {
      const { scope } = context;
      const { suffixLength = DEFAULT_SUFFIX_LENGTH, separator = DEFAULT_SEPARATOR } = props;

      // Find the AcceleratorStack in the parents.
      const parents = scope.node.scopes;
      const stack = parents.find((p: cdk.IConstruct): p is AcceleratorStack => p instanceof AcceleratorStack);
      if (!stack) {
        throw new Error(`The AcceleratorNameGenerator should only be used with constructs in AcceleratorStack`);
      }

      // Use the AcceleratorStack prefix
      const prefix = stack.acceleratorPrefix;

      // Create a suffix that is based on the path of the component
      const path = parents.map(p => p.node.id);
      const suffix = hashPath(path, suffixLength);

      return (
        prepareString(prefix, props) +
        cdk.Aws.ACCOUNT_ID +
        separator +
        cdk.Aws.REGION +
        separator +
        prepareString(name, props) +
        separator +
        prepareString(suffix, props)
      );
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
function prepareString(str: string, props: PrefixNameProps): string {
  if (cdk.Token.isUnresolved(str)) {
    // We should not modify an unresolved token
    return str;
  } else if (props.lowercase) {
    return str.toLowerCase();
  }
  return str;
}
