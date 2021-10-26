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
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { CurReportDefinition } from '@aws-accelerator/custom-resource-cur-report-definition';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { AccountStacks } from '../../common/account-stacks';
import { AccountBuckets } from '../defaults';

export interface ReportsStep1Props {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export async function step1(props: ReportsStep1Props) {
  const { accountBuckets, accountStacks, config } = props;

  const globalOptions = config['global-options'];
  const curConfig = globalOptions.reports['cost-and-usage-report'];

  const masterAccountKey = globalOptions['aws-org-management'].account;
  const masterStack = accountStacks.getOrCreateAccountStack(masterAccountKey);
  const masterBucket = accountBuckets[masterAccountKey];

  const report = new CurReportDefinition(masterStack, 'CurReportDefinition', {
    roleName: createRoleName('Reports'),
    bucket: masterBucket,
    bucketPrefix: `${cdk.Aws.ACCOUNT_ID}/${curConfig['s3-prefix']}`,
    bucketRegion: cdk.Aws.REGION,
    additionalArtifacts: curConfig['additional-artifacts'],
    additionalSchemaElements: curConfig['additional-schema-elements'],
    compression: curConfig.compression,
    format: curConfig.format,
    refreshClosedReports: curConfig['refresh-closed-reports'],
    reportName: curConfig['report-name'],
    reportVersioning: curConfig['report-versioning'],
    timeUnit: curConfig['time-unit'],
  });
  report.node.addDependency(masterBucket);
}
