import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { IConstruct } from 'constructs';

const deprecatedRuntimeList = ['nodejs10.x', 'nodejs12.x', 'nodejs14.x'];

export class LambdaDefaultRuntime implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof lambda.CfnFunction) {
      if (!node.runtime || deprecatedRuntimeList.includes(node.runtime)) {
        node.runtime = 'nodejs16.x';
      }
    }
  }
}
