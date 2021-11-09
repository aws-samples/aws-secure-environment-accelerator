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

import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, OutputUtilGenericType, SaveOutputsInput, saveIndexOutput, getIamSsmOutput } from './utils';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { saveKmsKeys, saveAcm } from './encrypt-utils';

interface EncryptOutput {
  kms: OutputUtilGenericType[];
  acm: OutputUtilGenericType[];
}

/**
 *
 * Outputs for kms and ACM related deployments will be found in following phases
 * - Phase-0
 * - Phase-1
 *
 * @param outputsTableName
 * @param client
 * @param config
 * @param account
 *
 * @returns void
 */
export async function saveEncryptsOutputs(props: SaveOutputsInput) {
  const {
    acceleratorPrefix,
    account,
    config,
    dynamodb,
    outputsTableName,
    assumeRoleName,
    region,
    outputUtilsTableName,
  } = props;

  const smRegion = config['global-options']['aws-org-management'].region;
  const phase0Outputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${smRegion}-0`, dynamodb);
  const phase1Outputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${smRegion}-1`, dynamodb);
  const outputs = [...phase0Outputs, ...phase1Outputs];
  const encryptOutputs = await getIamSsmOutput(outputUtilsTableName, `${account.key}-${region}-encrypt`, dynamodb);

  const kms: OutputUtilGenericType[] = [];
  const acm: OutputUtilGenericType[] = [];

  if (encryptOutputs) {
    const ssmIamOutput: EncryptOutput = JSON.parse(encryptOutputs);
    kms.push(...ssmIamOutput.kms);
    acm.push(...ssmIamOutput.acm);
  }

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);

  const updatedKms = await saveKmsKeys(config, outputs, ssm, account, region, acceleratorPrefix, kms);
  const updatedAcm = await saveAcm(config, outputs, ssm, account, region, acceleratorPrefix, acm);

  const encryptOutput: EncryptOutput = {
    kms: updatedKms,
    acm: updatedAcm,
  };
  const encryptIndexOutput = JSON.stringify(encryptOutput);
  console.log('encryptIndexOutput', encryptIndexOutput);
  await saveIndexOutput(outputUtilsTableName, `${account.key}-${region}-encrypt`, encryptIndexOutput, dynamodb);
}
