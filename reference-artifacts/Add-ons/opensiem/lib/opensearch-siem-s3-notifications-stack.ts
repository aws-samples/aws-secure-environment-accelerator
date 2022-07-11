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

import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import { SiemConfig } from './siem-config';

export interface OpenSearchSiemS3NotificationsStackProps extends StackProps {
  siemConfig: SiemConfig;
}

export class OpenSearchSiemS3NotificationsStack extends Stack {
  constructor(scope: Construct, id: string, props: OpenSearchSiemS3NotificationsStackProps) {
    super(scope, id, props);

    const { siemConfig } = props;

    let snsTopic;
    let kmsEncryptionKey;

    if (!siemConfig.s3NotificationTopicNameOrExistingArn.startsWith('arn')) {
      kmsEncryptionKey = new kms.Key(this, 'EncryptionKey', {
        enableKeyRotation: true,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      new kms.Alias(this, 'EncryptionKeyAlias', {
        aliasName: 'opensearch-siem-notifications',
        targetKey: kmsEncryptionKey,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      kmsEncryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Allow S3 use of the CMK',
          principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
          actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
          resources: ['*'],
        }),
      );
    }

    if (siemConfig.s3NotificationTopicNameOrExistingArn.startsWith('arn')) {
      snsTopic = sns.Topic.fromTopicArn(
        this,
        's3NotificationsTopicLookup',
        siemConfig.s3NotificationTopicNameOrExistingArn,
      );
    } else {
      snsTopic = new sns.Topic(this, 's3NotificationsTopic', {
        topicName: siemConfig.s3NotificationTopicNameOrExistingArn,
        masterKey: kmsEncryptionKey ?? undefined,
      });

      // Can't modify existing topic policies
      snsTopic.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Allow SIEM Subscription of Topic',
          principals: [new iam.AnyPrincipal()],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': siemConfig.organizationId,
            },
          },
          actions: ['sns:Subscribe'],
          resources: [snsTopic.topicArn],
        }),
      );
    }

    for (const s3BucketName of siemConfig.s3LogBuckets) {
      const bucket = s3.Bucket.fromBucketName(this, `LogBucketLookup-${s3BucketName}`, s3BucketName);
      bucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, new s3Notifications.SnsDestination(snsTopic));
      bucket.addEventNotification(s3.EventType.OBJECT_CREATED_POST, new s3Notifications.SnsDestination(snsTopic));
    }
  }
}
