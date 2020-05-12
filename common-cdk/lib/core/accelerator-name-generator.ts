import * as crypto from 'crypto';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack } from './accelerator-stack';

const SUFFIX_LENGTH = 8;

interface AcceleratorNameGeneratorProps {
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
 * Auxiliary class that has a static function to generate a name with a suffix.
 */
export class AcceleratorNameGenerator {
  /**
   * Generates a name with the Accelerator prefix of the AcceleratorStack, the given name and a random prefix based on
   * the constructs path.
   *
   * @param name
   */
  public static generate(name: string, props: AcceleratorNameGeneratorProps = {}): string {
    return cdk.Lazy.stringValue({
      produce: (context: cdk.IResolveContext) => {
        const { scope } = context;
        const { separator = '-' } = props;

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
        const suffix = this.hashPath(path);

        return (
          this.prepareString(prefix, props) +
          cdk.Aws.ACCOUNT_ID +
          separator +
          cdk.Aws.REGION +
          separator +
          this.prepareString(name, props) +
          separator +
          this.prepareString(suffix, props)
        );
      },
    });
  }

  /**
   * Based on `makeUniqueId`
   *
   * https://github.com/aws/aws-cdk/blob/f8df4e04f6f9631f963353903e020cfa8377e8bc/packages/%40aws-cdk/core/lib/private/uniqueid.ts#L33
   */
  private static hashPath(path: string[]) {
    const hash = crypto
      .createHash('md5')
      .update(path.join('/'))
      .digest('hex');
    return hash.slice(0, SUFFIX_LENGTH).toUpperCase();
  }

  private static prepareString(str: string, props: AcceleratorNameGeneratorProps): string {
    if (props.lowercase) {
      return str.toLowerCase();
    }
    return str;
  }
}
