#!/usr/bin/env node

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

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OpenSearchSiemStack } from '../lib/opensearch-siem-stack';
import { OpenSearchSiemS3NotificationsStack } from '../lib/opensearch-siem-s3-notifications-stack';
import * as sc from '../lib/siem-config';

sc.loadSiemConfig().then(siemConfig => {
  console.log(siemConfig);

  const app = new cdk.App();

  new OpenSearchSiemStack(app, 'OpenSearchSiemStack', {
    provisionServiceLinkedRole: false,
    siemConfig,
    env: {
      account: siemConfig.operationsAccountId,
      region: siemConfig.region,
    },
    tags: {
      Application: 'OpenSearch SIEM',
    },
  });

  new OpenSearchSiemS3NotificationsStack(app, 'OpenSearchSiemS3NotificationsStack', {
    siemConfig,
    env: {
      account: siemConfig.logArchiveAccountId,
      region: siemConfig.region,
    },
    tags: {
      Application: 'OpenSearch SIEM',
    },
  });
});
