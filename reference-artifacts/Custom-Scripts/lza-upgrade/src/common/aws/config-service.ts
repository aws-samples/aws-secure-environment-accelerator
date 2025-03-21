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
import { ConfigServiceClient, DeleteConfigurationAggregatorCommand } from '@aws-sdk/client-config-service';
import { Credentials } from '@aws-sdk/client-sts';
import { throttlingBackOff } from './backoff';

export class ConfigService {
  private readonly serviceClient: ConfigServiceClient;

  constructor(credentials?: Credentials, region?: string) {
    if (credentials) {
      this.serviceClient = new ConfigServiceClient({ credentials: {
        accessKeyId: credentials.AccessKeyId!,
        secretAccessKey: credentials.SecretAccessKey!,
        sessionToken: credentials.SessionToken! }, 
        region });
    } else {
      this.serviceClient = new ConfigServiceClient({});
    }
  }

  async deleteConfigAggregator(acceleratorPrefix: string): Promise<void> {
    try {
      await throttlingBackOff(() => this.serviceClient.send(new DeleteConfigurationAggregatorCommand({ ConfigurationAggregatorName: `${acceleratorPrefix}Config-Org-Aggregator` })));
    } catch (error) {
      console.log('No Org Aggregator found');
    }
  }
}
