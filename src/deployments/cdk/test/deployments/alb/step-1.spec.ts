// tslint:disable:no-any
import 'jest';
import * as cdk from '@aws-cdk/core';
import { createAlbName, createTargetGroupName } from '../../../src/deployments/alb/step-1';

test('the ALB name should not contain more than 32 characters', () => {
  const name = createAlbName({
    accountKey: 'master',
    albName: 'really-long-alb-name',
  }).replace(cdk.Aws.ACCOUNT_ID, '000000000000');

  expect(name.length).toBeLessThanOrEqual(32);
});

test('the ALB target group name should not contain more than 32 characters', () => {
  const name = createTargetGroupName({
    albName: 'really-long-alb-name',
    targetGroupName: 'really-long-target-group-name',
  }).replace(cdk.Aws.ACCOUNT_ID, '000000000000');

  expect(name.length).toBeLessThanOrEqual(32);
});
