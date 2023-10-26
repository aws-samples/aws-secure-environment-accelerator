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


const { CodePipeline, PutJobFailureResultCommand, PutJobSuccessResultCommand } = require("@aws-sdk/client-codepipeline");
const { SSM, GetParameterCommand } = require("@aws-sdk/client-ssm");
const { CloudFormation, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");

const codepipeline = new CodePipeline;
const ssm = new SSM;
const cfn = new CloudFormation;

exports.handler = async function (event, context) {
  console.info(`Vallidating Accelerator Perameters with previous execution...`);
  console.info(JSON.stringify(event, null, 2));

  const jobInfo = event['CodePipeline.job'];
  const jobId = jobInfo.id;

  try {
    const userParametersString = jobInfo.data.actionConfiguration.configuration.UserParameters;
    const userParameters = JSON.parse(userParametersString);
    const { acceleratorName, acceleratorPrefix } = userParameters;
    let versionParam;
    try {
      versionParam = await ssm.send(new GetParameterCommand({ Name: '/accelerator/version' }));
    } catch (ex) {
      console.warn(ex);
      if (ex.name !== 'ParameterNotFound') {
        throw new Error(ex);
      }
    }
    if (!versionParam) {
      console.log('First run of Accelerator');
    } else if (!versionParam.Parameter.Value) {
      console.warn("Didn't find value in /accelerator/version");
    } else {
      const versionParamValue = JSON.parse(versionParam.Parameter.Value);
      if (!versionParamValue.AcceleratorName && !versionParamValue.AcceleratorPrefix) {
        console.log("Didn't find AccelName and Prefix in /accelerator/version");
        try {
          await cfn.send(new DescribeStacksCommand({ StackName: `${acceleratorPrefix}InitialSetup` }));
        } catch (error) {
          throw new Error(`Invalid AcceleratorPrefix=${acceleratorPrefix} provided`);
        }
      } else if (
        versionParamValue.AcceleratorName !== acceleratorName ||
        versionParamValue.AcceleratorPrefix !== acceleratorPrefix
      ) {
        throw new Error(
          `Invalid AcceleratorPrefix and Name provided. Expected values are AcceleratorName=${versionParamValue.AcceleratorName} & AcceleratorPrefix=${versionParamValue.AcceleratorPrefix}`,
        );
      }
    }
    return codepipeline.send(new PutJobSuccessResultCommand({ jobId }));
  } catch (e) {
    console.info(`Unexpected error while Validating Parameters: ${e}`);
    return codepipeline.send(new PutJobFailureResultCommand({
      jobId,
      failureDetails: {
        externalExecutionId: context.awsRequestId,
        type: 'JobFailed',
        message: e.toString(),
      },
    }
    ));
  }
};
