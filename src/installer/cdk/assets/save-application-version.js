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

exports.handler({
  "CodePipeline.job": {
      "id": "3c6e0556-0ea2-4fe4-ad7a-53a2b37039f8",
      "accountId": "043926555987",
      "data": {
          "actionConfiguration": {
              "configuration": {
                  "FunctionName": "PBMMAccel-Installer-SaveApplicationVersion",
                  "UserParameters": "{\"commitId\":\"9e1b42c27827e220d7cacf58c3b829edcb005d9a\",\"repository\":\"aws-secure-environment-accelerator\",\"owner\":\"aws-samples\",\"branch\":\"fix/SM-Duplicate-Executions\",\"acceleratorVersion\":\"1.2.4\"}"
              }
          },
          "inputArtifacts": [],
          "outputArtifacts": [],
          "artifactCredentials": {
              "accessKeyId": "ASIAQUOR2BVJS4CSQV5Q",
              "secretAccessKey": "MgodwNq1WjiHB9RKTRKt6mpWAm5pXia3sXVnDet2",
              "sessionToken": "IQoJb3JpZ2luX2VjEFkaDGNhLWNlbnRyYWwtMSJHMEUCIA/Bof5GBXbZaDcdix1WQnpaKtEX2JfVtnvsfWT2S2ChAiEAptWI3HgLUZIuyQt91Fr8yySYU4d8LmWaP2DfiFQuEEAq5QMIQhAAGgwwNDM5MjY1NTU5ODciDL3F0zeS8PuQtXh6eirCAwppulOuzywPxiGa7FYlfhRH8MKYZ/r5s/7H3tE1om5XFOdcJg9FQVVQOaqO0h2MEDgVLx8QiLBhDmwCx+B3zY/O5H2X7Qwby8wx3Tm/iJBeuqwy2+18I87aob1/0wWi7XzIADrb+HwPGqaVKUcOWIo8rJVmODmMNlSnX8e/ygSSckL2oWZazMZfPKaIovo0RXG082otjP2N/cm6t+yKCRdKEXHuxTUx47Bbxiny7LFbAWQg2Nor6gxphjjurBTCLXbNHjw98fp8aupqeIztr/xu3l8vwIzDIc8NyH/MlwA46aLMY3Xbna2VrNe3v0ET6SX6JkNqTDCo0xvRsma1VXZtKXMkWc1dVSJAIEp+ZgtukCnTHjQdwGshH6nkCxeYvU8zYZG2RWUIivlppVrTQXW6JAZkpRZ3vuBr0va80HpKCzsoHHB4weQo1u4xS8UU3+IQ+WWTsK+kk1atTjLPA4vfoSlw+7lh9NunIIqGh351Wip+eEgLGGzyHrmH0rV9Ne1dPirn82LnoDcaPtS1bBFCmRRv9Oli/7tavb2YBKH7Ef21ZMoIdTtQLuZkWiFHPa3vLWWw1Wz/PCwSAQBSCKSJpDCF3sSABjq/AXod01Bk8VxU/9sIry4lEfXusiCXJrj6zY/vaW7rjm5gYIUWJtXmk+GPSOVScmfMtVDaGJNczwTwp85Et6ykULohRlL9ERPen/248GTch8oFtwpLDRnIQJbR3yoVHQTdUkxpfcp9urRoSZ4ULubEGj1CRXLfxyA5mazkUp47uv9Kta2whG6lSrIkrUzRbD7PwAsi+RkT9gspljNwbKanRVYXid/oNgSpyyiN+QsbNLfedTwC8DeR7ZtBgWV1PscJ",
              "expirationTime": 1611739785000
          }
      }
  }
})
