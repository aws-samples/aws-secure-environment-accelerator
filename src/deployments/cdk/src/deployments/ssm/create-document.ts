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

import { STS } from '@aws-accelerator/common/src/aws/sts';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as yaml from 'js-yaml';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { Account, getAccountId } from '../../utils/accounts';
import { SSMDocumentShare } from '@aws-accelerator/custom-resource-ssm-document-share';
import { SSMDocument } from '@aws-accelerator/custom-resource-ssm-create-document';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface CreateDocumentProps {
  acceleratorExecutionRoleName: string;
  centralBucketName: string;
  centralAccountId: string;
  config: c.AcceleratorConfig;
  accountStacks: AccountStacks;
  accounts: Account[];
  outputs: StackOutput[];
}

export async function createDocument(props: CreateDocumentProps) {
  const {
    acceleratorExecutionRoleName,
    config,
    centralAccountId,
    centralBucketName,
    accountStacks,
    accounts,
    outputs,
  } = props;
  const documentContents = await getSsmDocumentsContent({
    assumeRoleName: acceleratorExecutionRoleName,
    config,
    sourceAccountId: centralAccountId,
    sourceBucketName: centralBucketName,
  });
  if (!documentContents) {
    console.warn(`No SSM Documents found in S3`);
    return;
  }
  const documentsConfig = config['global-options']['ssm-automation'];
  const ssmdocuments: { [accountKey: string]: { [region: string]: { [documentName: string]: SSMDocument } } } = {};
  for (const documentConfig of documentsConfig) {
    for (const accountKey of documentConfig.accounts) {
      const ssmDocumentRole = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        roleKey: 'SSMDocumentRole',
      });
      for (const document of documentConfig.documents) {
        for (const region of documentConfig.regions) {
          const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
          if (!accountStack) {
            throw new Error(`Account Stack didn't find for account "${accountKey}" and region "${region}"`);
          }
          let content;
          if (document.template.endsWith('.json')) {
            content = JSON.parse(documentContents[accountKey][document.name]);
          } else {
            content = yaml.load(documentContents[accountKey][document.name]);
          }
          content.description = document.description;
          const documentName = createName({
            name: document.name,
            suffixLength: 0,
          });
          // Share Document to accounts
          if (!ssmDocumentRole) {
            console.error(`SSMDocument Create Role not found in account "${accountKey}"`);
            continue;
          }

          const ssmDocument = new SSMDocument(accountStack, `SsmDocument-${document.name}`, {
            content: JSON.stringify(content),
            name: documentName,
            roleArn: ssmDocumentRole.roleArn,
            type: 'Automation',
          });

          if (!ssmdocuments[accountKey]) {
            ssmdocuments[accountKey] = {};
            ssmdocuments[accountKey][region] = {};
          } else if (!ssmdocuments[accountKey][region]) {
            ssmdocuments[accountKey][region] = {};
          }
          ssmdocuments[accountKey][region][document.name] = ssmDocument;
          const sharedAccounts = config
            .getAccountConfigs()
            .filter(([_, accountConfig]) =>
              accountConfig['ssm-automation'].find(
                ssmConf =>
                  ssmConf.account === accountKey &&
                  ssmConf.regions.includes(region) &&
                  ssmConf.documents.includes(document.name),
              ),
            )
            .map(([acckey, _]) => getAccountId(accounts, acckey)!);
          const sharedOus = config
            .getOrganizationalUnits()
            .filter(([_, ouConfig]) =>
              ouConfig['ssm-automation'].find(
                ssmConf =>
                  ssmConf.account === accountKey &&
                  ssmConf.regions.includes(region) &&
                  ssmConf.documents.includes(document.name),
              ),
            )
            .map(([ouKey, _]) => ouKey);
          sharedAccounts.push(...sharedOus.map(ou => accounts.filter(acc => acc.ou === ou).map(a => a.id)).flat());
          const shareAccountIds: string[] = Array.from(new Set(sharedAccounts));
          if (shareAccountIds.length === 0) {
            continue;
          }

          const ssmDocumentShare = new SSMDocumentShare(accountStack, `SsmDocument${document.name}`, {
            accountIds: shareAccountIds,
            name: documentName,
            roleArn: ssmDocumentRole.roleArn,
          });
          ssmDocumentShare.node.addDependency(ssmDocument);
        }
      }
    }
  }
}

async function getSsmDocumentsContent(props: {
  assumeRoleName: string;
  sourceAccountId: string;
  sourceBucketName: string;
  config: c.AcceleratorConfig;
}): Promise<{ [accountKey: string]: { [documentName: string]: string } } | undefined> {
  const { assumeRoleName, sourceAccountId, sourceBucketName, config } = props;

  const sts = new STS();
  const sourceAccountCredentials = await sts.getCredentialsForAccountAndRole(sourceAccountId, assumeRoleName);

  const s3 = new S3(sourceAccountCredentials);
  const artifactsPrefix = 'ssm-documents/';
  const documentsConfig = config['global-options']['ssm-automation'];
  const accountDocumentContents: { [accountKey: string]: { [documentName: string]: string } } = {};
  for (const documentConfig of documentsConfig) {
    for (const accountKey of documentConfig.accounts) {
      if (!accountDocumentContents[accountKey]) {
        accountDocumentContents[accountKey] = {};
      }
    }
    for (const document of documentConfig.documents) {
      const documentKey = artifactsPrefix + document.template;
      try {
        const documentContent = await s3.getObjectBodyAsString({
          Bucket: sourceBucketName,
          Key: documentKey,
        });
        documentConfig.accounts.map(accountKey => {
          accountDocumentContents[accountKey][document.name] = documentContent;
        });
      } catch (e) {
        console.warn(`Cannot load SSM Document Content s3://${sourceBucketName}/${documentKey}`);
        throw e;
      }
    }
  }
  return accountDocumentContents;
}
