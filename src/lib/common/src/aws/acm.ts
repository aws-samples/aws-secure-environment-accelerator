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

import aws from 'aws-sdk';

import {
  ACM as acm,
  ImportCertificateCommandInput,
  ImportCertificateCommandOutput,
  RequestCertificateCommandInput,
  RequestCertificateCommandOutput,
} from '@aws-sdk/client-acm';

// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
aws.config.logger = console;
import { throttlingBackOff } from './backoff';

export class ACM {
  private readonly client: ACM;

  public constructor(credentials?: aws.Credentials) {
    this.client = new acm({
      credentials,
      logger: console,
    });
  }

  /**
   * to import certificate into AWS Certificate Manager
   * @param params
   */
  async importCertificate(params: ImportCertificateCommandInput): Promise<ImportCertificateCommandOutput> {
    return throttlingBackOff(() => this.client.importCertificate(params).promise());
  }

  /**
   * to request ACM certificate
   * @param params
   */
  async requestCertificate(params: RequestCertificateCommandInput): Promise<RequestCertificateCommandOutput> {
    return throttlingBackOff(() => this.client.requestCertificate(params).promise());
  }
}
