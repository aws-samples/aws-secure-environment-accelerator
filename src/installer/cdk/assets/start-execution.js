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

const AWS = require('aws-sdk');

const codepipeline = new AWS.CodePipeline();
const sfn = new AWS.StepFunctions();

exports.handler = async function (event, context) {
  console.info(`Starting state machine execution...`);
  console.info(JSON.stringify(event, null, 2));

  const jobInfo = event['CodePipeline.job'];
  const jobId = jobInfo.id;

  try {
    const userParametersString = jobInfo.data.actionConfiguration.configuration.UserParameters;
    const userParameters = JSON.parse(userParametersString);
    if (!userParameters.stateMachineArn) {
      throw new Error(`"stateMachineArn" is missing from user parameters`);
    }

    const smInput = {
      scope: 'FULL',
      mode: 'APPLY',
      verbose: '0',
    };

    await sfn
      .startExecution({
        stateMachineArn: userParameters.stateMachineArn,
        input: JSON.stringify(smInput),
      })
      .promise();

    return codepipeline
      .putJobSuccessResult({
        jobId,
      })
      .promise();
  } catch (e) {
    console.info(`Unexpected error while starting execution: ${e}`);

    return codepipeline
      .putJobFailureResult({
        jobId,
        failureDetails: {
          externalExecutionId: context.awsRequestId,
          type: 'JobFailed',
          message: JSON.stringify(e),
        },
      })
      .promise();
  }
};
