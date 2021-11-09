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

interface VerifyDeleteVPCInput {
  /**
   * Multi dimensional Array since we get one Array from each output
   */
  errors: string[][];
}

interface VerifyDeleteVPCOutput {
  status: string;
  /**
   * Single Dimensional Array constructed for readablity from Multi Dimensional
   */
  errors: string[];
}

export const handler = async (input: VerifyDeleteVPCInput): Promise<VerifyDeleteVPCOutput> => {
  console.log(`Verifying Delete VPC Output...`);
  console.log(JSON.stringify(input, null, 2));
  const { errors } = input;
  const finalErrors = errors.flatMap(accountErrors => accountErrors);
  let status = 'SUCCESS';
  if (finalErrors.length > 0) {
    status = 'FAILED';
  }
  console.log(status, finalErrors);
  return {
    status,
    errors: finalErrors,
  };
};
