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

import aws from './aws-client';
import * as acm from 'aws-sdk/clients/acm';
import { throttlingBackOff } from './backoff';

export class ACM {
  private readonly client: aws.ACM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.ACM({
      credentials,
    });
  }

  /**
   * to import certificate into AWS Certificate Manager
   * @param params
   */
  async importCertificate(params: acm.ImportCertificateRequest): Promise<acm.ImportCertificateResponse> {
    return throttlingBackOff(() => this.client.importCertificate(params).promise());
  }

  /**
   * to request ACM certificate
   * @param params
   */
  async requestCertificate(params: acm.RequestCertificateRequest): Promise<acm.RequestCertificateResponse> {
    return throttlingBackOff(() => this.client.requestCertificate(params).promise());
  }
}
