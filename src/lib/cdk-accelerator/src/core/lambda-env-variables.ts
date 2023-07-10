import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { IConstruct } from 'constructs';

export class LambdaEnvironmentVariables implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof lambda.Function) {
      node.addEnvironment('BACKOFF_START_DELAY', process.env.BACKOFF_START_DELAY || '2000');
      node.addEnvironment('MIGRATION_ENABLED', process.env.MIGRATION_ENABLED ?? 'false');
    }
  }
}
