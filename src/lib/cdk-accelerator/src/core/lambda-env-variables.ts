import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';

export class LambdaEnvironmentVariables implements cdk.IAspect {
  visit(node: cdk.IConstruct): void {
    if (node instanceof lambda.Function) {
      node.addEnvironment('BACKOFF_START_DELAY', process.env['BACKOFF_START_DELAY'] || '5000');
    }
  }
}
