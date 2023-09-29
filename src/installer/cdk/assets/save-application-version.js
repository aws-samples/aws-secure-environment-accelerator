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
const { SSM, GetParameterCommand, PutParameterCommand, GetParameterHistoryCommand } = require("@aws-sdk/client-ssm");

const codepipeline = new CodePipeline();
const ssm = new SSM();

exports.handler = async function (event, context) {
  console.info(`Saving Accelerator Application Version...`);
  console.info(JSON.stringify(event, null, 2));

  const jobInfo = event['CodePipeline.job'];
  const jobId = jobInfo.id;

  try {
    const userParametersString = jobInfo.data.actionConfiguration.configuration.UserParameters;
    const userParameters = JSON.parse(userParametersString);

    const currentTime = new Date();
    const versionData = {
      Branch: userParameters.branch,
      Repository: userParameters.repository,
      CommitId: userParameters.commitId,
      Owner: userParameters.owner,
      DeployTime: currentTime.toString(),
      AcceleratorVersion: userParameters.acceleratorVersion,
      AcceleratorName: userParameters.acceleratorName,
      AcceleratorPrefix: userParameters.acceleratorPrefix,
    }
    const param = await ssm.send(new PutParameterCommand({
      Name: '/accelerator/version',
      Value: JSON.stringify(versionData, null, 2),
      Type: 'String',
      Overwrite: true,
    }));
    console.log(`Updated Application Version : ${param}`);
    try {
      await ssm.send(new GetParameterCommand({
        Name: '/accelerator/first-version'
      }));
    } catch (e) {
      if (e.name === 'ParameterNotFound') {
        let firstInstlVersion;
        const parameterVersions = [];
        let token;
        do {
          const response = await ssm.send(new GetParameterHistoryCommand({ Name: '/accelerator/version', NextToken: token, MaxResults: 50 }));
          token = response.NextToken;
          if (response.Parameters) {
            parameterVersions.push(...response.Parameters);
          }
        } while (token);
        const installerVersion = parameterVersions.find(p => p.Version === 1);
        if (installerVersion && installerVersion.Value) {
          const installerVersionValue = JSON.parse(installerVersion.Value);
          if (installerVersionValue.AcceleratorVersion) {
            firstInstlVersion = installerVersionValue.AcceleratorVersion;
          } else {
            firstInstlVersion = '<1.2.2';
          }
        }
        if (!firstInstlVersion) {
          throw new Error('First Installed Version not found in SSM Parameter Store "/accelerator/version"')
        }
        console.log("Inserting Installed version param ", firstInstlVersion);
        await ssm.send(new PutParameterCommand({
          Name: '/accelerator/first-version',
          Value: firstInstlVersion,
          Type: 'String',
          Overwrite: false,
          Description: 'Accelerator first installed version',
        }));
      } else {
        throw new Error(e);
      }
    }

    return codepipeline.send(new PutJobSuccessResultCommand({ jobId }));
  } catch (e) {
    console.info(`Unexpected error while Saving Application Versio: ${e}`);
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
