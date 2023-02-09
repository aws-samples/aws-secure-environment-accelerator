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
import * as ram from 'aws-cdk-lib/aws-ram';
import { Construct } from 'constructs';

export interface TransitGatewaySharingProps {
  name: string;
  tgwId: string;
  principals: string[];
}

export class TransitGatewaySharing extends Construct {
  constructor(scope: Construct, id: string, props: TransitGatewaySharingProps) {
    super(scope, id);

    new ram.CfnResourceShare(this, 'Resource', {
      name: props.name,
      principals: props.principals,
      resourceArns: [`arn:aws:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:transit-gateway/${props.tgwId}`],
    });
  }
}
