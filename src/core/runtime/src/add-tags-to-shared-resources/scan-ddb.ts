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

import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { loadOutputs } from '../utils/load-outputs';

interface ScanDDBRequestInput {
  assumeRoleName: string;
  outputTableName: string;
  s3Bucket: string;
  accounts: string[];
}

interface ScanDDBOutput {
  accounts: string[],
  assumeRoleName: string,
  outputTableName: string,
  s3Bucket: string,
  s3Key: string
}

const dynamodb = new DynamoDB();
const s3 = new S3();

export const handler = async (input: ScanDDBRequestInput) => {
  console.log(`Scanning DynamoDB for shared resources...`);
  console.log(JSON.stringify(input, null, 2));
  
  const { assumeRoleName, outputTableName, s3Bucket, accounts } = input;
  const key = `${Date.now()}-ddb_output.json`;
  const outputs = await loadOutputs(outputTableName, dynamodb);


  
  if (!s3Bucket) {
    return {
      status: 'FAILURE',
      statusReason: `${s3Bucket} not found please review.`
    };
  }

  try {
    const fileUploadResult = await s3.putObject({
      Body: JSON.stringify(outputs),
      Key: key,
      Bucket: s3Bucket,
    });
    console.log(JSON.stringify(fileUploadResult));
    console.log(`DynamoDB scan results saved to ${s3Bucket}/${key}`)
  } catch (e) {
    throw new Error(
      `Unable to write DynamoDB output to ${s3Bucket}\n${e.message} code:${e.code}`,
    );
  }

  const output: ScanDDBOutput = {
    accounts: accounts,
    assumeRoleName: assumeRoleName,
    outputTableName: outputTableName,
    s3Bucket: s3Bucket,
    s3Key: key
  }
  
  return output;
}
