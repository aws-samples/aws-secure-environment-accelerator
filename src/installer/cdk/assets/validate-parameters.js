const AWS = require('aws-sdk');
AWS.config.logger = console;
const codepipeline = new AWS.CodePipeline();
const ssm = new AWS.SSM();
const cfn = new AWS.CloudFormation();

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
      versionParam = await ssm
      .getParameter({
        Name: '/accelerator/version',
      })
      .promise();
    } catch (ex) {
      console.warn(ex);
      if (ex.code !== 'ParameterNotFound') {
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
          await cfn
            .describeStacks({
              StackName: `${acceleratorPrefix}InitialSetup`,
            })
            .promise();
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
    return codepipeline
      .putJobSuccessResult({
        jobId,
      })
      .promise();
  } catch (e) {
    console.info(`Unexpected error while Validating Parameters: ${e}`);
    return codepipeline
      .putJobFailureResult({
        jobId,
        failureDetails: {
          externalExecutionId: context.awsRequestId,
          type: 'JobFailed',
          message: e.toString(),
        },
      })
      .promise();
  }
};
