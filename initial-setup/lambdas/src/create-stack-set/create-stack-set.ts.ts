import AdmZip from 'adm-zip';
import * as aws from 'aws-sdk';
import { Context } from 'aws-lambda';
import { CloudFormation, objectToCloudFormationParameters } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

const cfn = new CloudFormation();

interface CreateMasterExecutionRoleInput {
  stackName: string;
  stackCapabilities?: string[];
  stackParameters?: { [key: string]: any };
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
  console.log(`Creating stack set...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    stackName,
    stackCapabilities,
    stackParameters,
    stackTemplateArtifactBucket,
    stackTemplateArtifactKey,
    stackTemplateArtifactPath,
    stackTemplateArtifactCredentials,
  } = input;

  // TODO Move this to a common-lambda
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

  await cfn.createOrUpdateStackSet({
    StackSetName: stackName,
    TemplateBody: stackTemplate,
    Capabilities: stackCapabilities,
    Parameters: objectToCloudFormationParameters(stackParameters),
  });
};
