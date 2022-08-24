import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';

export class LambdaDefaultTimeout implements cdk.IAspect {
  visit(node: cdk.IConstruct): void {
    if (node instanceof lambda.CfnFunction) {
      if (!node.timeout) {
        node.timeout = 60;
      }
    }
  }
}
