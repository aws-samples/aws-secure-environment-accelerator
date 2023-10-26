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

const { CodePipeline, PutJobSuccessResultCommand, PutJobFailureResultCommand } = require("@aws-sdk/client-codepipeline");
const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const codepipeline = new CodePipeline;
const sfn = new SFNClient;

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

    await sfn.send(new StartExecutionCommand(
      {
        stateMachineArn: userParameters.stateMachineArn,
        input: JSON.stringify(smInput),
      }));

    return codepipeline.send(new PutJobSuccessResultCommand({
      jobId,
    }));
  } catch (e) {
    console.info(`Unexpected error while starting execution: ${e}`);

    return codepipeline.send(new PutJobFailureResultCommand({
      jobId,
      failureDetails: {
        externalExecutionId: context.awsRequestId,
        type: 'JobFailed',
        message: JSON.stringify(e),
      },
    }
    ));
  }
};
