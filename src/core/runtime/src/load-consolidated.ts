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

import { LoadConfigurationInput } from './load-configuration-step';
import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { S3 } from '@aws-accelerator/common/src/aws/s3';

export interface LoadConsolidatedInput extends LoadConfigurationInput {
  s3WorkingBucket?: string;
}

export interface LoadConsolidatedResult {
  bucket?: string;
  configKey?: string;
}

const s3 = new S3();

export const handler = async (input: LoadConsolidatedInput) => {
  console.log(`Loading Configuration Info...`);
  console.log(JSON.stringify(input, null, 2));

  const { configCommitId, configFilePath, configRepositoryName, s3WorkingBucket } = input;

  const result: LoadConsolidatedResult = {};

  if (s3WorkingBucket) {
    result.bucket = s3WorkingBucket;
    const path = `${configCommitId}`;

    const codecommit = new CodeCommit(undefined, undefined);
    try {
      const file = await codecommit.getFile(configRepositoryName, configFilePath, configCommitId);
      const source = file.fileContent.toString();

      const key = `${path}/config.json`;
      const fileUploadResult = await s3.putObject({
        Body: source,
        Key: key,
        Bucket: s3WorkingBucket,
      });
      console.log(JSON.stringify(fileUploadResult));
      result.configKey = key;
    } catch (e) {
      throw new Error(
        `Unable to load configuration file "${configFilePath}" in Repository ${configRepositoryName}\n${e.message} code:${e.code}`,
      );
    }
  }

  console.log(`Result: ${JSON.stringify(result)}`);
  return result;
};
