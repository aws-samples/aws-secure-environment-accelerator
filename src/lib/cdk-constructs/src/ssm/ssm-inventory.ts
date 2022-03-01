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

import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';

export interface InventoryProps {
  bucketName: string;
  bucketRegion: string;
  accountId: string;
  prefix: string;
}

export class GatherInventory extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, private readonly props: InventoryProps) {
    super(scope, id);

    new ssm.CfnResourceDataSync(this, 'ResourceDataSync', {
      bucketName: props.bucketName,
      bucketRegion: props.bucketRegion,
      syncName: `${props.prefix}${props.accountId}-Inventory`,
      syncFormat: 'JsonSerDe',
      bucketPrefix: `ssm-inventory`,
      syncType: 'SyncToDestination',
    });

    new ssm.CfnAssociation(this, 'GatherInventory', {
      name: `AWS-GatherSoftwareInventory`,
      associationName: `${props.prefix}${props.accountId}-InventoryCollection`,
      scheduleExpression: 'rate(12 hours)',
      targets: [
        {
          key: 'InstanceIds',
          values: ['*'],
        },
      ],
    });
  }
}
