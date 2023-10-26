import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export class LambdaDefaultMemory implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      if (node.cfnResourceType === 'AWS::Lambda::Function') {
        // eslint-disable-next-line
        const cfnProps = (node as cdk.aws_lambda.CfnFunction)['_cfnProperties'];
        let memorySize = cfnProps.MemorySize?.toString();

        if (!memorySize) {
          memorySize = (node as cdk.aws_lambda.CfnFunction).memorySize;
        }

        if (!memorySize || memorySize < 256) {
          node.addPropertyOverride('MemorySize', 256);
        }
      }
    }
  }
}
