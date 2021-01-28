const AWS = require('aws-sdk');

const codepipeline = new AWS.CodePipeline();
const ssm = new AWS.SSM();

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
      Owner:userParameters.owner,
      DeployTime: currentTime.toString(),
      AcceleratorVersion: userParameters.acceleratorVersion,
    }
    const param = await ssm.putParameter({
      Name: '/accelerator/version', 
      Value: JSON.stringify(versionData, null, 2), 
      Type: 'String',
      Overwrite: true,
    }).promise();
    console.log(`Updated Application Version : ${param}`);
    try {
      await ssm.getParameter({
        Name: '/accelerator/first-version'
      }).promise();
    } catch (e) {
      if (e.code === 'ParameterNotFound') {
        let firstInstlVersion;
        const parameterVersions = [];
        let token;
        do {
          const response = await ssm.getParameterHistory({ Name: '/accelerator/version', NextToken: token, MaxResults: 50 }).promise();
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
        await ssm.putParameter({
          Name: '/accelerator/first-version',
          Value: firstInstlVersion,
          Type: 'String',
          Overwrite: false,
          Description: 'Accelerator first installed version',
        }).promise();
      } else {
        throw new Error(e);
      }
    }

    return codepipeline
      .putJobSuccessResult({
        jobId,
      })
      .promise();
  } catch (e) {
    console.info(`Unexpected error while Saving Application Versio: ${e}`);
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
