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

import * as aws from 'aws-sdk';
import * as cfn from 'aws-sdk/clients/cloudformation';
import AdmZip from 'adm-zip';
import { CloudFormation, objectToCloudFormationParameters } from '@aws-accelerator/common/src/aws/cloudformation';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { arrayEqual } from '@aws-accelerator/common/src/util/arrays';

interface CreateStackSetInput {
  stackName: string;
  stackCapabilities: string[];
  stackParameters: { [key: string]: string };
  stackTemplate: StackTemplateLocation;
}

export const handler = async (input: CreateStackSetInput) => {
  console.log(`Creating stack set...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, stackCapabilities, stackParameters, stackTemplate } = input;

  // Load the template body from the given location
  const templateBody = await getTemplateBody(stackTemplate);
  const parameters = objectToCloudFormationParameters(stackParameters);

  const cloudFormation = new CloudFormation();
  const stackSet = await cloudFormation.describeStackSet(stackName);
  if (stackSet) {
    if (
      stackSet.TemplateBody === templateBody &&
      parametersEqual(stackSet.Parameters, parameters) &&
      capabilitiesEqual(stackSet.Capabilities, stackCapabilities)
    ) {
      return {
        status: 'UP_TO_DATE',
        statusReason: `Template for stack set ${stackName} is already up to date`,
      };
    }

    // The stack set is not up to date so we have to update it
    await cloudFormation.updateStackSet({
      StackSetName: stackName,
      TemplateBody: templateBody,
      Capabilities: stackCapabilities,
      Parameters: parameters,
      OperationPreferences: {
        FailureTolerancePercentage: 100,
        MaxConcurrentPercentage: 100,
      },
    });
    return {
      status: 'SUCCESS',
      statusReason: `Template for stack set ${stackName} is being updated`,
    };
  }

  await cloudFormation.createStackSet({
    StackSetName: stackName,
    TemplateBody: templateBody,
    Capabilities: stackCapabilities,
    Parameters: parameters,
  });
  return {
    status: 'SUCCESS',
    statusReason: `Template for stack set ${stackName} is being created`,
  };
};

/**
 * Returns true if both parameter list `a` and `b` are equal according to the `ParameterKey` and `ParameterValue`.
 *
 * @param a Parameter list to compare
 * @param b Parameter list that is compared
 */
function parametersEqual(a: cfn.Parameters | undefined, b: cfn.Parameters | undefined): boolean {
  return arrayEqual(a, b, (pa, pb) => pb.ParameterKey === pa.ParameterKey && pb.ParameterValue === pa.ParameterValue);
}

/**
 * Returns true if both capability list `a` and `b` contain the same elements.
 *
 * @param a Capability list to compare
 * @param b Capability list that is compared
 */
function capabilitiesEqual(a: cfn.Capabilities | undefined, b: cfn.Capabilities | undefined) {
  return arrayEqual(a, b);
}

export type StackTemplateLocation = StackTemplateLocationBody | StackTemplateLocationS3 | StackTemplateLocationArtifact;

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

export function isStackTemplateLocationBody(value: unknown): value is StackTemplateLocationBody {
  return typeof value === 'string';
}

export function isStackTemplateLocationS3(value: unknown): value is StackTemplateLocationS3 {
  return typeof value === 'object' && value !== null && value.hasOwnProperty('s3BucketName');
}

export function isStackTemplateLocationArtifact(value: unknown): value is StackTemplateLocationArtifact {
  return typeof value === 'object' && value !== null && value.hasOwnProperty('artifactBucket');
}

export async function getTemplateBody(location: StackTemplateLocation): Promise<string> {
  if (isStackTemplateLocationBody(location)) {
    return location;
  } else if (isStackTemplateLocationS3(location)) {
    const s3 = new S3();
    return s3.getObjectBodyAsString({
      Bucket: location.s3BucketName,
      Key: location.s3ObjectKey,
    });
  } else if (isStackTemplateLocationArtifact(location)) {
    // Read the template as the master account
    const credentials = new aws.Credentials(location.artifactCredentials);
    const s3 = new S3(credentials);
    const artifact = await s3.getObjectBody({
      Bucket: location.artifactBucket,
      Key: location.artifactKey,
    });

    // Extract the stack template from the ZIP file
    const zip = new AdmZip(artifact as Buffer);
    return zip.readAsText(location.artifactPath);
  }
  throw new Error(`Unknown stack template location ${location}`);
}
