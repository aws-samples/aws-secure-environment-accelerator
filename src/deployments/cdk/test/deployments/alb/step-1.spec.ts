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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import 'jest';
import * as cdk from '@aws-cdk/core';
import { createLbName, createTargetGroupName } from '../../../src/deployments/alb/step-1';

test('the ALB name should not contain more than 32 characters', () => {
  const name = createLbName({
    accountKey: 'master',
    name: 'really-long-alb-name',
    type: 'alb',
  }).replace(cdk.Aws.ACCOUNT_ID, '000000000000');

  expect(name.length).toBeLessThanOrEqual(32);
});

test('the ALB target group name should not contain more than 32 characters', () => {
  const name = createTargetGroupName({
    lbName: 'really-long-alb-name',
    targetGroupName: 'really-long-target-group-name',
  }).replace(cdk.Aws.ACCOUNT_ID, '000000000000');

  expect(name.length).toBeLessThanOrEqual(32);
});
