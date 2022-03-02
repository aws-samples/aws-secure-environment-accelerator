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

import * as aws from 'aws-sdk';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { FMS } from '@aws-accelerator/common/src/aws/fms';
import { IAM } from '@aws-accelerator/common/src/aws/iam';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { LoadConfigurationInput } from './load-configuration-step';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { loadAccounts } from './utils/load-accounts';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { AcceleratorConfig } from '@aws-accelerator/common-config';

interface EnableTrustedAccessForServicesInput extends LoadConfigurationInput {
  parametersTableName: string;
}

const dynamodb = new DynamoDB();

const ssm = new SSM();
export const handler = async (input: EnableTrustedAccessForServicesInput) => {
  console.log(`Enable Trusted Access for AWS services within the organization ...`);
  console.log(JSON.stringify(input, null, 2));

  const { parametersTableName, configRepositoryName, configFilePath, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const securityAccountId: string | undefined = await getAccountId(
    config,
    parametersTableName,
    MandatoryAccountType.SecurityAccount,
  );
  if (!securityAccountId) {
    return;
  }

  const operationsAccountId: string | undefined = await getAccountId(
    config,
    parametersTableName,
    MandatoryAccountType.OperationsAccount,
  );
  if (!operationsAccountId) {
    return;
  }

  const ram = new aws.RAM();
  await ram.enableSharingWithAwsOrganization().promise();

  // await org.enableAWSServiceAccess('ram.amazonaws.com');
  console.log('Enabled Resource Access Manager service access within the Organization.');

  const org = new Organizations();
  await org.enableAWSServiceAccess('fms.amazonaws.com');
  console.log('Enabled Firewall Manager service access within the Organization.');

  const fms = new FMS();
  await fms.associateAdminAccount(securityAccountId);
  console.log('Security account registered as admin account for Firewall Manager in the organization.');

  await org.enableAWSServiceAccess('access-analyzer.amazonaws.com');
  console.log('Enabled Access Analyzer service access within the Organization.');

  await org.enableAWSServiceAccess('guardduty.amazonaws.com');
  console.log('Enabled Guard Duty service access within the Organization.');

  await org.enableAWSServiceAccess('cloudtrail.amazonaws.com');
  console.log('Enabled Cloud Trail service access within the Organization.');

  await org.enableAWSServiceAccess('config.amazonaws.com');
  console.log('Enabled Config service access within the Organization.');

  await org.enableAWSServiceAccess('ssm.amazonaws.com');
  console.log('Enabled SSM service access within the Organization');

  const iam = new IAM();
  // as access analyzer will be created in security account, creating service linked role specifically in master.
  try {
    await iam.createServiceLinkedRole('access-analyzer.amazonaws.com');
  } catch (e) {
    if (
      e.message ===
      'Service role name AWSServiceRoleForAccessAnalyzer has been taken in this account, please try a different suffix.'
    ) {
      // ignore exception
    } else {
      throw e;
    }
  }
  console.log('AWS Service Linked Role created for Access Analyzer service in master account.');

  await org.registerDelegatedAdministrator(securityAccountId, 'access-analyzer.amazonaws.com');
  console.log('Security account registered as delegated administrator for Access Analyzer in the organization.');

  await org.registerDelegatedAdministrator(securityAccountId, 'guardduty.amazonaws.com');
  console.log('Security account registered as delegated administrator for Guard Duty in the organization.');

  await org.registerDelegatedAdministrator(operationsAccountId, 'ssm.amazonaws.com');
  console.log('Operations account registered as delegated administrator for SSM in the organization.');

  // Get all the parameter history versions from SSM parameter store
  try {
    const firstInstalVersionParam = await ssm.getParameter('/accelerator/first-version');
    if (!firstInstalVersionParam.Parameter || !firstInstalVersionParam.Parameter.Value) {
      throw new Error('Missing value in "/accelerator/first-version"');
    }
    return firstInstalVersionParam.Parameter?.Value;
  } catch (e) {
    if (e.code === 'ParameterNotFound') {
      throw new Error('ParameterNotFound - Did you use the latest installer?');
    } else {
      throw new Error(e);
    }
  }
};

enum MandatoryAccountType {
  SecurityAccount = 'central-security-services',
  OperationsAccount = 'central-operations-services',
  LoggingAccount = 'central-log-services',
}

async function getAccountId(
  config: AcceleratorConfig,
  tableName: string,
  globalOptionsLookupKey: MandatoryAccountType,
) {
  const accountKey = config['global-options'][globalOptionsLookupKey].account;
  const accounts = await loadAccounts(tableName, dynamodb);
  const account = accounts.find(a => a.key === accountKey);
  if (!account) {
    console.warn(`Cannot find account with type ${globalOptionsLookupKey}`);
    return;
  }
  return account.id;
}
