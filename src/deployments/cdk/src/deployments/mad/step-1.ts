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

import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ServiceLinkedRole } from '@aws-accelerator/cdk-constructs/src/iam';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { CfnSleep } from '@aws-accelerator/custom-resource-cfn-sleep';
import { AccountStacks } from '../../common/account-stacks';
import { StructuredOutput } from '../../common/structured-output';
import { MadAutoScalingRoleOutput, MadAutoScalingRoleOutputType, CfnMadImageIdOutputTypeOutput } from './outputs';
import { AccountRegionEbsEncryptionKeys } from '../defaults';

export interface MadStep1Props {
  acceleratorName: string;
  acceleratorPrefix: string;
  accountEbsEncryptionKeys: AccountRegionEbsEncryptionKeys;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export async function step1(props: MadStep1Props) {
  const { accountStacks, accountEbsEncryptionKeys, config, acceleratorName, acceleratorPrefix } = props;
  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const madConfig = accountConfig.deployments?.mad;
    if (!madConfig || !madConfig.deploy) {
      continue;
    }

    const region = madConfig.region;
    const accountEbsEncryptionKey = accountEbsEncryptionKeys[accountKey]?.[region];
    if (!accountEbsEncryptionKey) {
      console.warn(
        `Could not find EBS encryption key in account "${accountKey}" and region "${region}" ` +
          `to deploy service-linked role`,
      );
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    // Create the auto scaling service-linked role manually in order to attach the policy to the default EBS KMS key
    const role = new ServiceLinkedRole(accountStack, 'Slr', {
      awsServiceName: 'autoscaling.amazonaws.com',
      customSuffix: acceleratorName,
      description: `${acceleratorPrefix}Autoscaling Role for ${acceleratorName}`,
    });

    // Sleep 30 seconds after creation of the role, otherwise the key policy creation will fail
    const roleSleep = new CfnSleep(accountStack, 'SlrSleep', {
      sleep: 30 * 1000,
    });
    roleSleep.node.addDependency(role);

    // Make sure to create the role before using it in the key policy
    accountEbsEncryptionKey.node.addDependency(roleSleep);

    // See https://docs.aws.amazon.com/autoscaling/ec2/userguide/key-policy-requirements-EBS-encryption.html
    accountEbsEncryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow service-linked role use of the CMK',
        principals: [new iam.ArnPrincipal(role.roleArn)],
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        resources: ['*'],
      }),
    );

    accountEbsEncryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow attachment of persistent resources',
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

    new StructuredOutput<MadAutoScalingRoleOutput>(accountStack, 'MadSlrOutput', {
      type: MadAutoScalingRoleOutputType,
      value: {
        roleArn: role.roleArn,
      },
    });

    const imageId = ssm.StringParameter.valueForTypedStringParameterV2(
      accountStack,
      madConfig['image-path'],
      ssm.ParameterValueType.AWS_EC2_IMAGE_ID,
    );

    new CfnMadImageIdOutputTypeOutput(accountStack, 'MadImageIdOutput', {
      imageId,
      imagePath: madConfig['image-path'],
      imageKey: 'MadAutoScalingImageId',
    });
  }
}
