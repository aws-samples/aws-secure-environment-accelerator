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

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { HandlerProperties } from '@aws-accelerator/custom-resource-cur-report-definition-runtime';
import { Construct } from 'constructs';

export type AdditionalArtifact = 'REDSHIFT' | 'QUICKSIGHT' | 'ATHENA' | string;
export type CompressionFormat = 'ZIP' | 'GZIP' | 'Parquet' | string;
export type ReportFormat = 'textORcsv' | 'Parquet' | string;
export type ReportVersioning = 'CREATE_NEW_REPORT' | 'OVERWRITE_REPORT' | string;
export type SchemaElement = 'RESOURCES' | string;
export type TimeUnit = 'HOURLY' | 'DAILY' | string;

export interface CurReportDefinitionProps {
  reportName: string;
  timeUnit: TimeUnit;
  format: ReportFormat;
  compression: CompressionFormat;
  additionalSchemaElements: SchemaElement[];
  bucket: s3.IBucket;
  bucketRegion: string;
  bucketPrefix: string;
  additionalArtifacts?: AdditionalArtifact[];
  refreshClosedReports?: boolean;
  reportVersioning?: ReportVersioning;
  /**
   * @default cdk.RemovalPolicy.RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;
  roleName?: string;
}

const resourceType = 'Custom::CurReportDefinition';

/**
 * Custom resource implementation that creates log subscription for directory service.
 */
export class CurReportDefinition extends Construct {
  constructor(scope: Construct, id: string, private readonly props: CurReportDefinitionProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      ReportName: this.props.reportName,
      TimeUnit: this.props.timeUnit,
      Format: this.props.format,
      Compression: this.props.compression,
      AdditionalSchemaElements: this.props.additionalSchemaElements,
      S3Bucket: this.props.bucket.bucketName,
      S3Prefix: this.props.bucketPrefix,
      S3Region: this.props.bucketRegion,
      AdditionalArtifacts: this.props.additionalArtifacts,
      RefreshClosedReports: this.props.refreshClosedReports,
      ReportVersioning: this.props.reportVersioning,
    };

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      removalPolicy: this.props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      properties: handlerProperties,
    });

    // Grant permissions for billing reports to write the reports to the bucket
    const principal = new iam.ServicePrincipal('billingreports.amazonaws.com');
    const bucket = this.props.bucket;
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow billing reports to check bucket policy',
        principals: [principal],
        actions: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
        resources: [bucket.bucketArn],
      }),
    );
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow billing reports to add reports to bucket',
        principals: [principal],
        actions: ['s3:PutObject'],
        resources: [bucket.arnForObjects('*')],
      }),
    );
    bucket.encryptionKey?.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow billing reports to use the encryption key',
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        principals: [principal],
        resources: ['*'],
      }),
    );
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-cur-report-definition-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      roleName: this.props.roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['cur:*', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(60),
    });
  }
}
