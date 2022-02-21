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

import { Stack, StackProps, CfnParameter, CfnOutput, Tokenization } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import { SiemConfig } from './siem-config';

export interface OpenSearchSiemS3NotificationsStackProps extends StackProps {
  siemConfig: SiemConfig;
}

export class OpenSearchSiemS3NotificationsStack extends Stack {
  constructor(scope: Construct, id: string, props: OpenSearchSiemS3NotificationsStackProps) {
    super(scope, id, props);

    const { siemConfig } = props;

    const lambdaProcessorArnParam = new CfnParameter(this, 'lambdaProcessorArn', {
      type: 'String',
      description: 'The SIEM Lambda Processor ARN.',
    });

    const lambdaFunction = lambda.Function.fromFunctionArn(
      this,
      'LambdaProcessor',
      lambdaProcessorArnParam.valueAsString,
    );

    for (const s3BucketName of siemConfig.s3LogBuckets) {
      const bucket = s3.Bucket.fromBucketName(this, `LogBucketLookup-${s3BucketName}`, s3BucketName);
      bucket.addEventNotification(
        s3.EventType.OBJECT_CREATED_PUT,
        new s3Notifications.LambdaDestination(lambdaFunction),
      );
      bucket.addEventNotification(
        s3.EventType.OBJECT_CREATED_POST,
        new s3Notifications.LambdaDestination(lambdaFunction),
      );
    }
  }
}
