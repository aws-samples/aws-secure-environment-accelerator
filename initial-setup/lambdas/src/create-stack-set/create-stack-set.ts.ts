import * as aws from 'aws-sdk';
import AdmZip from 'adm-zip';
import { CloudFormation, objectToCloudFormationParameters } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

const cfn = new CloudFormation();

interface CreateMasterExecutionRoleInput {
  stackName: string;
  stackCapabilities: string[];
  stackParameters: { [key: string]: string };
  stackTemplate: StackTemplateLocationBody | StackTemplateLocationS3 | StackTemplateLocationArtifact;
}

export type StackTemplateLocationBody = string;

export interface StackTemplateLocationS3 {
  s3BucketName: string;
  s3ObjectKey: string;
}

export interface StackTemplateLocationArtifact {
  artifactBucket: string;
  artifactKey: string;
  artifactPath: string;
  artifactCredentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  };
}

function isStackTemplateLocationBody(value: unknown): value is StackTemplateLocationBody {
  return typeof value === 'string';
}

function isStackTemplateLocationS3(value: unknown): value is StackTemplateLocationS3 {
  return typeof value === 'object' && value !== null && value.hasOwnProperty('s3BucketName');
}

function isStackTemplateLocationArtifact(value: unknown): value is StackTemplateLocationArtifact {
  return typeof value === 'object' && value !== null && value.hasOwnProperty('artifactBucket');
}

export const handler = async (input: CreateMasterExecutionRoleInput) => {
  console.log(`Creating stack set...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, stackCapabilities, stackParameters, stackTemplate } = input;

  let templateBody;
  if (isStackTemplateLocationBody(stackTemplate)) {
    templateBody = stackTemplate;
  } else if (isStackTemplateLocationS3(stackTemplate)) {
    const s3 = new S3();
    templateBody = await s3.getObjectBodyAsString({
      Bucket: stackTemplate.s3BucketName,
      Key: stackTemplate.s3ObjectKey,
    });
  } else if (isStackTemplateLocationArtifact(stackTemplate)) {
    // Read the template as the master account
    const credentials = new aws.Credentials(stackTemplate.artifactCredentials!);
    const s3 = new S3(credentials);
    const artifact = await s3.getObjectBody({
      Bucket: stackTemplate.artifactBucket!,
      Key: stackTemplate.artifactKey!,
    });

    // Extract the stack template from the ZIP file
    const zip = new AdmZip(artifact as Buffer);
    templateBody = zip.readAsText(stackTemplate.artifactPath!);
  }

  await cfn.createOrUpdateStackSet({
    StackSetName: stackName,
    TemplateBody: templateBody,
    Capabilities: stackCapabilities,
    Parameters: objectToCloudFormationParameters(stackParameters),
  });
};
