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

  const masterAccountKey = globalOptions['aws-org-master'].account;
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
