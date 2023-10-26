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

import * as cfn_inc from 'aws-cdk-lib/cloudformation-include';
import { Construct } from 'constructs';

export namespace CfnInclude {
  export interface Props {
    path: string;
  }
}

export class CfnInclude extends Construct {
  constructor(scope: Construct, id: string, props: CfnInclude.Props) {
    super(scope, id);

    new cfn_inc.CfnInclude(this, 'include', {
      templateFile: props.path,
    });
  }
}
