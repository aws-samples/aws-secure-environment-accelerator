import * as crypto from 'crypto';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack } from './accelerator-stack';

const SUFFIX_LENGTH = 8;

/**
 * Auxiliary class that has a static function to generate a name with a suffix.
 */
export class AcceleratorNameGenerator {
  /**
   * Generates a name with the Accelerator prefix of the AcceleratorStack, the given name and a random prefix based on
   * the constructs path.
   *
   * @param name
   */
  public static generate(name: string): string {
    return cdk.Lazy.stringValue({
      produce: context => {
        const { scope } = context;
        const parents = scope.node.scopes;
        const stack = parents.find((p: cdk.IConstruct): p is AcceleratorStack => p instanceof AcceleratorStack);
        if (!stack) {
          throw new Error(`The AcceleratorNameGenerator should only be used on nodes in an AcceleratorStack`);
        }

        const path = parents.map(p => p.node.id);
        const hash = this.hashPath(path);
        return stack.acceleratorPrefix + name + hash;
      },
    });
  }

  /**
   * Based on uniqueId.
   * https://github.com/aws/aws-cdk/blob/f8df4e04f6f9631f963353903e020cfa8377e8bc/packages/%40aws-cdk/core/lib/private/uniqueid.ts#L33
   */
  static hashPath(path: string[]) {
    const hash = crypto
      .createHash('md5')
      .update(path.join('/'))
      .digest('hex');
    return hash.slice(0, SUFFIX_LENGTH).toUpperCase();
  }
}
