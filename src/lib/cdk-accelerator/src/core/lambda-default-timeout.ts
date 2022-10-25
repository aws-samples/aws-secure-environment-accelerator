import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class LambdaDefaultTimeout implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof lambda.CfnFunction) {
      if (!node.timeout) {
        node.timeout = 60;
      }
    }
  }
}
