import * as aws from 'aws-sdk';
import AdmZip from 'adm-zip';
import { Context } from 'aws-lambda';
import { CloudFormation, objectToCloudFormationParameters } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

interface CreateMasterExecutionRoleInput {
  assumeRoleArn: string;
  stackName: string;
  stackCapabilities?: string[];
  stackParameters?: { [key: string]: string };
  stackTemplateArtifactBucket?: string;
  stackTemplateArtifactKey?: string;
  stackTemplateArtifactPath?: string;
  stackTemplateArtifactCredentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  };
}

export const handler = async (input: CreateMasterExecutionRoleInput, context: Context) => {
  console.log(`Creating stack...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    stackName,
    stackCapabilities,
    stackParameters,
    stackTemplateArtifactBucket,
    stackTemplateArtifactKey,
    stackTemplateArtifactPath,
    stackTemplateArtifactCredentials,
    assumeRoleArn,
  } = input;

  // Read the template as the master account
  const s3creds = new aws.Credentials(stackTemplateArtifactCredentials!!);
  const s3 = new S3(s3creds);
  const artifact = await s3.getObjectBody({
    Bucket: stackTemplateArtifactBucket!!,
    Key: stackTemplateArtifactKey!!,
  });

  // Extract the stack template from the ZIP file
  const zip = new AdmZip(artifact as Buffer);
  const stackTemplate = zip.readAsText(stackTemplateArtifactPath!!);

  console.debug(`Creating stack template`);
  console.debug(stackTemplate);

  const sts = new STS();
  const credentials = await sts.getCredentialsForRoleArn(assumeRoleArn!!);

  // Deploy the stack using the assumed role in the current region
  const cfn = new CloudFormation(credentials);
  await cfn.createOrUpdateStack({
    StackName: stackName!!,
    TemplateBody: stackTemplate,
    Capabilities: stackCapabilities,
    Parameters: objectToCloudFormationParameters(stackParameters),
  });
};
