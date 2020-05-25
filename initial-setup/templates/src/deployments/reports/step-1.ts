import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { CurReportDefinition } from '@custom-resources/cur-report-definition';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
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

  new CurReportDefinition(masterStack, 'CurReportDefinition', {
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
}
