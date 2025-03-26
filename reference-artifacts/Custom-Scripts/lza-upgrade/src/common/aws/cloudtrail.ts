/* eslint-disable */
/**
 *  Copyright 2025 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { CloudTrailClient, DeleteTrailCommand } from '@aws-sdk/client-cloudtrail';
import { Credentials } from '@aws-sdk/client-sts';
import { throttlingBackOff } from './backoff';

export class Cloudtrail {
  private readonly serviceClient: CloudTrailClient;

  constructor(credentials?: Credentials, region?: string) {
    if (credentials) {
      this.serviceClient = new CloudTrailClient({ credentials: {
        accessKeyId: credentials.AccessKeyId!,
        secretAccessKey: credentials.SecretAccessKey!,
        sessionToken: credentials.SessionToken! }, 
        region });
    } else {
      this.serviceClient = new CloudTrailClient({});
    }
  }

  async deleteOrganizationTrail(acceleratorPrefix: string): Promise<void> {
    try {
      await throttlingBackOff(() => this.serviceClient.send(new DeleteTrailCommand({ Name: `${acceleratorPrefix}Org-Trail` })));
    } catch (error) {
      console.log(`Unable to delete Organization CloudTrail ${acceleratorPrefix}Org-Trail`);
    }
  }
}
