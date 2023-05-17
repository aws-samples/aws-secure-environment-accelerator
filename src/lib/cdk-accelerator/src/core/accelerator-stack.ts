/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import {
  AcceleratorNameTagger,
  AcceleratorProtectedTagger,
  LambdaEnvironmentVariables,
  LambdaDefaultTimeout,
  LambdaDefaultMemory,
  LambdaDefaultRuntime,
} from '.';
import { Construct, IConstruct } from 'constructs';

export interface AcceleratorStackProps extends cdk.StackProps {
  acceleratorName: string;
  acceleratorPrefix: string;
}

export class AcceleratorStack extends cdk.Stack {
  readonly acceleratorName: string;
  readonly acceleratorPrefix: string;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.acceleratorName = props.acceleratorName;
    this.acceleratorPrefix = props.acceleratorPrefix;

    // Add Stack level tags using this.tags, so that CDK won't add them to resource in CFN
    this.tags.setTag('AcceleratorName', this.acceleratorName);
    cdk.Aspects.of(this).add(new cdk.Tag('Accelerator', this.acceleratorName));
    cdk.Aspects.of(this).add(new AcceleratorNameTagger());
    cdk.Aspects.of(this).add(new AcceleratorProtectedTagger(this.acceleratorName));
    cdk.Aspects.of(this).add(new LambdaEnvironmentVariables());
    cdk.Aspects.of(this).add(new LambdaDefaultTimeout());
    cdk.Aspects.of(this).add(new LambdaDefaultMemory());
    cdk.Aspects.of(this).add(new LambdaDefaultRuntime());
  }

  static of(construct: IConstruct): AcceleratorStack {
    const parents = construct.node.scopes;
    const stack = parents.find((p: IConstruct): p is AcceleratorStack => p instanceof AcceleratorStack);
    if (!stack) {
      throw new Error(`The construct should only be used inside an AcceleratorStack`);
    }
    return stack;
  }
}
