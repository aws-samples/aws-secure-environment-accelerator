/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as organizations from 'aws-sdk/clients/organizations';
import aws from './aws-client';
import { throttlingBackOff } from './backoff';

export class Organizations {
  private readonly client: aws.Organizations;
  private policies: organizations.PolicySummary[] = [];

  constructor(credentials?: aws.Credentials, region = 'us-east-1') {
    this.client = new aws.Organizations({
      credentials,
      region,
    });
  }

  async getScpContent(policyName: string) {
    if (this.policies.length === 0) {
      await this.loadPolicies();
    }
    const policy = this.policies.find((pol) => pol.Name === policyName);
    if (!policy) return;
    const response = await throttlingBackOff(() =>
      this.client
        .describePolicy({
          PolicyId: policy.Id!,
        })
        .promise(),
    );
    return response.Policy?.Content ?? '';
  }

  private async loadPolicies() {
    // const policies: organizations.PolicySummary[] = [];
    let nextToken: organizations.NextToken | undefined;
    do {
      const response = await throttlingBackOff(() =>
        this.client
          .listPolicies({
            Filter: 'SERVICE_CONTROL_POLICY',
            MaxResults: 20,
            NextToken: nextToken,
          })
          .promise(),
      );
      nextToken = response.NextToken;
      this.policies.push(...(response.Policies ?? []));
    } while (nextToken);
  }
}
