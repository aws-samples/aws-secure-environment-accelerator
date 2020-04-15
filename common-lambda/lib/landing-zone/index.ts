import * as fs from 'fs';
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
        console.warn(`Cannot find Landing Zone outputs for version and bucket in stack with name "${summary.StackName}"`);
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

    // Extract the stack template from the ZIP file
    const zip = new AdmZip(artifact as Buffer);
    const manifest = zip.readAsText('manifest.yaml');

    // Parse the Landing Zone configuration file
    const config = fromYaml(manifest);

    return new LandingZoneStack({
      ...props,
      version,
      bucketName,
      config,
    });
  }
}
