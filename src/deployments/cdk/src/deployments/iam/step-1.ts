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

import * as c from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamRoleOutput } from './outputs';
import { LogBucketOutput } from '../defaults/outputs';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface IamConfigServiceRoleProps {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

export async function createConfigServiceRoles(props: IamConfigServiceRoleProps): Promise<void> {
  const { accountStacks, config, acceleratorPrefix, outputs } = props;
  const accountKeys = config.getAccountConfigs().map(([accountKey, _]) => accountKey);

  const globalOptions = config['global-options'];
  const baseline = globalOptions['ct-baseline'] ? 'CONTROL_TOWER' : 'ORGANIZATIONS';
  const securityAccountKey = config.getMandatoryAccountKey('central-security');
  const centralOperationsKey = config.getMandatoryAccountKey('central-operations');
  const centralLogKey = config.getMandatoryAccountKey('central-log');
  let logBucketDetails;
  try {
    logBucketDetails = LogBucketOutput.getBucket({
      accountStacks,
      config,
      outputs,
    });
  } catch (err) {
    console.log('Log Bucket not created yet. Continuing.');
  }

  for (const accountKey of accountKeys) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.error(`Not able to create stack for "${accountKey}"`);
      continue;
    }

    if (
      (accountKey === securityAccountKey &&
        baseline !== 'CONTROL_TOWER' &&
        globalOptions['central-security-services']['config-aggr']) || // Don't deploy if CT; aggregator is configured there.
      (accountKey === centralOperationsKey && globalOptions['central-operations-services']['config-aggr']) ||
      (accountKey === centralLogKey && globalOptions['central-log-services']['config-aggr'])
    ) {
      // Creating role for Config Organization Aggregator
      const configAggregatorRole = new iam.Role(accountStack, `IAM-ConfigAggregatorRole-${accountKey}`, {
        roleName: createRoleName(`ConfigAggregatorRole`),
        description: `${acceleratorPrefix} Config Aggregator Role`,
        assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRoleForOrganizations')],
      });

      new CfnIamRoleOutput(accountStack, `ConfigAggregatorRoleOutput-${accountKey}`, {
        roleName: configAggregatorRole.roleName,
        roleArn: configAggregatorRole.roleArn,
        roleKey: 'ConfigAggregatorRole',
      });
    }

    // Creating role for Config Recorder
    const configRecorderRole = new iam.Role(accountStack, `IAM-ConfigRecorderRole-${accountKey}`, {
      roleName: createRoleName(`ConfigRecorderRole`),
      description: `${acceleratorPrefix} Config Recorder Role`,
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole')],
    });

    /**
     *
     *  As per the documentation, the config role should have
     * the s3:PutObject permission to avoid access denied issues
     * while AWS config tries to check the s3 bucket (in another account) write permissions
     * https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-policy.html
     *
     */
    configRecorderRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject*', 's3:GetBucketAcl'],
        resources: ['*'],
      }),
    );

    if (logBucketDetails && logBucketDetails.encryptionKey) {
      configRecorderRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Encrypt', 'kms:GenerateDataKey'],
          resources: [logBucketDetails.encryptionKey.keyArn],
        }),
      );
    }

    new CfnIamRoleOutput(accountStack, `ConfigRecorderRoleOutput`, {
      roleName: configRecorderRole.roleName,
      roleArn: configRecorderRole.roleArn,
      roleKey: 'ConfigRecorderRole',
    });
  }

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // Creating role for Config Organization Aggregator
  const configAggregatorRole = new iam.Role(masterAccountStack, `IAM-ConfigAggregatorRole-${masterAccountKey}`, {
    roleName: createRoleName(`ConfigAggregatorRole`),
    description: `${acceleratorPrefix} Config Aggregator Role`,
    assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRoleForOrganizations')],
  });

  new CfnIamRoleOutput(masterAccountStack, `ConfigAggregatorRoleOutput`, {
    roleName: configAggregatorRole.roleName,
    roleArn: configAggregatorRole.roleArn,
    roleKey: 'ConfigAggregatorRole',
  });
}
