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

 interface VerifyAddTagsToResourceInput {
    /**
     * Input from Step Function map runs
     */
    accounts: string[];
    assumeRoleName: string;
    outputTableName: string;
    s3Bucket: string;
    results: string[];
  }
  
  interface VerifyAddTagsToResourceOutput {
    status: string;
    /**
     * Single Dimensional Array constructed for readablity from Multi Dimensional
     */
    errors: string[];
  }
  
  export const handler = async (input: VerifyAddTagsToResourceInput): Promise<VerifyAddTagsToResourceOutput> => {
    console.log(`Verifying Add Tags to Resources...`);
    console.log(JSON.stringify(input, null, 2));

    const results = input.results;
    const aggregatedErrorResponses = results.filter(results => results.status !== 'SUCCESS');
    let status = 'SUCCESS'

    if (aggregatedErrorResponses && aggregatedErrorResponses.length > 0) {
      status = 'FAILURE';
    }
 
    return {
      status,
      errors: aggregatedErrorResponses,
    };

  };
  