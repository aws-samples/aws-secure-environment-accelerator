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
import * as s3 from 'aws-sdk/clients/s3';
import AdmZip from 'adm-zip';
import { CloudFormation } from '../aws/cloudformation';
import { S3 } from '../aws/s3';
import { fromYaml, LandingZoneConfig } from './config';

export class LandingZone {
  private readonly cfn: CloudFormation;
  private readonly credentials: aws.Credentials | undefined;

  constructor(credentials?: aws.Credentials) {
    this.cfn = new CloudFormation(credentials);
    this.credentials = credentials;
  }

  /**
   * Find the CloudFormation stack that corresponds to the Landing Zone stack.
   */
  async findLandingZoneStack(): Promise<LandingZoneStack | null> {
    // Use a generator here so we don't have to load all pages when we find the result in the first page
    const stacks = this.cfn.listStacksGenerator({
      StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE'],
    });
    for await (const summary of stacks) {
      const stack = await this.cfn.describeStack(summary.StackName);
      if (!stack) {
        console.warn(`Cannot describe stack with name "${summary.StackName}" and ID "${summary.StackId}"`);
        continue;
      }

      const outputs: cfn.Outputs = stack.Outputs || [];
      const versionOutput = outputs.find(output => output.OutputKey === LandingZoneStack.VERSION_OUTPUT_KEY);
      const bucketOutput = outputs.find(output => output.OutputKey === LandingZoneStack.BUCKET_OUTPUT_KEY);
      if (!versionOutput || !bucketOutput) {
        console.warn(
          `Cannot find Landing Zone outputs for version and bucket in stack with name "${summary.StackName}"`,
        );
        continue;
      }

      return LandingZoneStack.fromStack({
        credentials: this.credentials,
        versionOutput,
        bucketOutput,
      });
    }
    return null;
  }
}

export interface LandingZoneStackProps {
  credentials?: aws.Credentials;
  versionOutput: cfn.Output;
  bucketOutput: cfn.Output;
}

interface LandingZoneBuildProps {
  credentials?: aws.Credentials;
  version: string;
  bucketName: string;
  config: LandingZoneConfig;
}

/**
 * Class representing the Landing Zone stack.
 */
export class LandingZoneStack {
  readonly version: string;
  readonly config: LandingZoneConfig;

  constructor(props: LandingZoneStackProps & LandingZoneBuildProps) {
    this.version = props.version;
    this.config = props.config;
  }

  public static readonly KMS_KEY_ALIAS = 'AwsLandingZoneKMSKey';
  public static readonly VERSION_OUTPUT_KEY = 'LandingZoneSolutionVersion';
  public static readonly BUCKET_OUTPUT_KEY = 'LandingZonePipelineS3Bucket';

  static loadLandingZoneConfig(rawData: Buffer): LandingZoneConfig {
    // Extract the stack template from the ZIP file
    const zip = new AdmZip(rawData);
    const manifest = zip.readAsText('manifest.yaml');

    // Parse the Landing Zone configuration file
    const config = fromYaml(manifest);

    return config;
  }

  static createLandingZoneConfig(from: string, to: string) {
    const zip = new AdmZip();
    zip.addLocalFolder(from);
    zip.writeZip(to);
  }

  static async fromStack(props: LandingZoneStackProps): Promise<LandingZoneStack> {
    const version = props.versionOutput.OutputValue!;
    if (version < '2.3.1') {
      throw new Error(`Landing Zone version "${version} is not supported`);
    }

    const bucketName = props.bucketOutput.OutputValue!;
    const bucketKey = 'aws-landing-zone-configuration.zip';

    let artifact: s3.Body | undefined;
    try {
      const client = new S3(props.credentials);
      artifact = await client.getObjectBody({
        Bucket: bucketName,
        Key: bucketKey,
      });
    } catch (e) {
      if (e.message === 'Access Denied') {
        console.error(`Access denied to the Landing Zone configuration file at "s3://${bucketName}/${bucketKey}"`);
        console.error(`Please make sure you have access to the KMS key "AwsLandingZoneKMSKey".`);
      }
      throw e;
    }

    const config = this.loadLandingZoneConfig(artifact as Buffer);

    return new LandingZoneStack({
      ...props,
      version,
      bucketName,
      config,
    });
  }
}
