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
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { Account } from '../../utils/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { ServiceLinkedRole } from '@aws-accelerator/cdk-constructs/src/iam';
import { CfnSleep } from '@aws-accelerator/custom-resource-cfn-sleep';
import { StructuredOutput } from '../../common/structured-output';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import {
  CfnOpenSearchRoleOutput,
  CfnOpenSearchLambdaProcessingRoleOutput,
  OpenSearchClusterDNSOutput,
} from './outputs';
import { AccountRegionEbsEncryptionKeys } from '../defaults';
import { Organizations } from '@aws-accelerator/custom-resource-organization';

export interface OpenSearchSIEMStep1Props {
  acceleratorPrefix: string;
  accounts: Account[];
  accountEbsEncryptionKeys: AccountRegionEbsEncryptionKeys;
  config: AcceleratorConfig;
  accountStacks: AccountStacks;
  logBuckets: s3.IBucket[];
  outputs: StackOutput[];
}

/**
 *
 * @param props
 * @returns
 *
 * Enables Amazon OpenSearch
 */
export async function step1(props: OpenSearchSIEMStep1Props) {
  const { accountStacks, accountEbsEncryptionKeys, config, acceleratorPrefix, outputs } = props;
  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const openSearchClusters = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: OpenSearchClusterDNSOutput,
    });
    const openSearchClusterExists = openSearchClusters.length == 1;

    console.log(`OpenSearchSiem-Step1: ${openSearchClusterExists}`);

    const openSearchSIEMDeploymentConfig = accountConfig.deployments?.siem; //If a DNS entry exists and deploy is false, it could be a delete but it will fail while in use. Subsequent runs will remove all this.
    if (!openSearchClusterExists && (!openSearchSIEMDeploymentConfig || !openSearchSIEMDeploymentConfig.deploy)) {
      continue;
    }

    if (openSearchSIEMDeploymentConfig == undefined) {
      console.warn(`Could not find the SIEM configuration`);
      continue;
    }

    const region = openSearchSIEMDeploymentConfig!.region;
    const accountEbsEncryptionKey = accountEbsEncryptionKeys[accountKey]?.[region];
    if (!accountEbsEncryptionKey) {
      console.warn(`Could not find EBS encryption key in account "${accountKey}" to deploy service-linked role`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    // Create the opensearch service-linked role manually
    const role = new ServiceLinkedRole(accountStack, 'OpenSearchSlr', {
      awsServiceName: 'es.amazonaws.com',
    });

    // Sleep 30 seconds after creation of the role, otherwise the key policy creation will fail
    const roleSleep = new CfnSleep(accountStack, 'OpenSearchSlrSleep', {
      sleep: 30 * 1000,
    });
    roleSleep.node.addDependency(role);

    // Make sure to create the role before using it in the key policy
    accountEbsEncryptionKey.node.addDependency(roleSleep);

    // See https://docs.aws.amazon.com/autoscaling/ec2/userguide/key-policy-requirements-EBS-encryption.html
    accountEbsEncryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow OS service-linked role use of the CMK',
        principals: [new iam.ArnPrincipal(role.roleArn)],
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        resources: ['*'],
      }),
    );

    accountEbsEncryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow OS attachment of persistent resources',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(role.roleArn)],
        actions: ['kms:CreateGrant'],
        resources: ['*'],
        conditions: {
          Bool: {
            'kms:GrantIsForAWSResource': 'true',
          },
        },
      }),
    );

    const lambdaProcessingRoleName = `${acceleratorPrefix}OpenSearchLambdaProcessingRole`;
    const lambdaProcessingRole = new iam.Role(accountStack, 'OpenSearchLambdaProcessingRole', {
      roleName: lambdaProcessingRoleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ],
    });

    lambdaProcessingRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: ['*'],
      }),
    );

    if (props.logBuckets.length > 0) {
      const organizations = new Organizations(props.logBuckets[0].stack, 'OrganizationsOpenSearch');

      for (const logBucket of props.logBuckets) {
        logBucket.addToResourcePolicy(
          new iam.PolicyStatement({
            principals: [new iam.AnyPrincipal()],
            actions: ['s3:GetObject'],
            resources: [`${logBucket.bucketArn}/*`],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': organizations.organizationId,
              },
              ArnLike: {
                'aws:PrincipalARN': `arn:aws:iam::*:role/${lambdaProcessingRoleName}*`,
              },
            },
          }),
        );

        if (logBucket.encryptionKey) {
          logBucket.encryptionKey.addToResourcePolicy(
            new iam.PolicyStatement({
              sid: 'Allow OS processing role use of the CMK',
              principals: [new iam.AnyPrincipal()],
              actions: ['kms:Decrypt'],
              resources: ['*'],
              conditions: {
                StringEquals: {
                  'aws:PrincipalOrgID': organizations.organizationId,
                },
                ArnLike: {
                  'aws:PrincipalARN': `arn:aws:iam::*:role/${lambdaProcessingRoleName}*`,
                },
              },
            }),
          );
        }
      }
    }

    new CfnOpenSearchLambdaProcessingRoleOutput(accountStack, 'OpenSearchLambdaProcessingRoleOutput', {
      roleArn: lambdaProcessingRole.roleArn,
    });

    new CfnOpenSearchRoleOutput(accountStack, 'OpenSearchSlrOutput', {
      roleArn: role.roleArn,
    });
  }
}
