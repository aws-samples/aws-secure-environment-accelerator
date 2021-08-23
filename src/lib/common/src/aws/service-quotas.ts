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
import * as sq from 'aws-sdk/clients/servicequotas';
import { listWithNextToken } from './next-token';
import { arrayMax } from '../util/arrays';
import { throttlingBackOff } from './backoff';

const OPEN_STATUSES: sq.RequestStatus[] = ['PENDING', 'CASE_OPENED'];

export interface RenewServiceQuotaIncrease {
  ServiceCode: string;
  QuotaCode: string;
  DesiredValue: number;
  MinTimeBetweenRequestsMillis: number;
}

export class ServiceQuotas {
  private readonly client: aws.ServiceQuotas;

  public constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.ServiceQuotas({
      credentials,
      region,
    });
  }

  /**
   * Get the service quota or get the default service quota.
   *
   * @throws Error when the quota can not be found.
   */
  async getServiceQuotaOrDefault(req: sq.GetServiceQuotaRequest): Promise<sq.ServiceQuota> {
    let response;
    try {
      response = await throttlingBackOff(() => this.client.getServiceQuota(req).promise());
    } catch (e) {
      response = await throttlingBackOff(() => this.client.getAWSDefaultServiceQuota(req).promise());
    }
    if (!response || !response.Quota) {
      throw new Error(`Cannot get quota with service code "${req.ServiceCode}" and quota code "${req.QuotaCode}"`);
    }
    return response.Quota;
  }

  /**
   * Wrapper listRequestedServiceQuotaChangeHistoryByQuota that adds pagination.
   */
  async listRequestedServiceQuotaChangeHistoryByQuota(
    req: sq.ListRequestedServiceQuotaChangeHistoryByQuotaRequest,
  ): Promise<sq.RequestedServiceQuotaChange[]> {
    return listWithNextToken<
      sq.ListRequestedServiceQuotaChangeHistoryByQuotaRequest,
      sq.ListRequestedServiceQuotaChangeHistoryByQuotaResponse,
      sq.RequestedServiceQuotaChange
    >(this.client.listRequestedServiceQuotaChangeHistoryByQuota.bind(this.client), r => r.RequestedQuotas!, req);
  }

  /**
   * Request or renew a request for a service quota increase. The request will only be renewed when there is no existing
   * open request or when the last request is more than `MinTimeBetweenRequestsMillis` ago.
   *
   * @returns True if the request has been sent, false otherwise
   */
  async renewServiceQuotaIncrease(req: RenewServiceQuotaIncrease): Promise<boolean> {
    try {
      const requestedQuotas = await throttlingBackOff(() =>
        this.listRequestedServiceQuotaChangeHistoryByQuota({
          ServiceCode: req.ServiceCode,
          QuotaCode: req.QuotaCode,
        }),
      );

      // Check that there are no open requests
      const openRequest = requestedQuotas.find(request => OPEN_STATUSES.includes(request.Status!));
      if (openRequest) {
        console.debug(`Quota "${req.QuotaCode}" increase request is already in progress`);
        return false;
      }

      // Find the last request and check that it is more than `MinTimeBetweenRequestsMillis` ago
      const lastRequest = arrayMax(requestedQuotas, compareQuotaRequest);
      if (lastRequest) {
        const currentDate = new Date();
        const timeDiff = currentDate.getTime() - lastRequest.Created!.getTime();
        if (timeDiff <= req.MinTimeBetweenRequestsMillis) {
          console.log(`Quota "${req.QuotaCode}" already made a request on ${lastRequest.Created}.`);
          return false;
        }
      }

      console.debug(`Requesting increase for quota "${req.QuotaCode}" to desired value ${req.DesiredValue}.`);

      await throttlingBackOff(() =>
        this.client
          .requestServiceQuotaIncrease({
            ServiceCode: req.ServiceCode,
            QuotaCode: req.QuotaCode,
            DesiredValue: req.DesiredValue,
          })
          .promise(),
      );
      return true;
    } catch (e) {
      if (e.code === 'QuotaExceededException') {
        console.warn(`The account has too many open service quota increse requests`);
        return false;
      }
      throw e;
    }
  }
}

/**
 * Method used to sort the service requests.
 */
function compareQuotaRequest(a: sq.RequestedServiceQuotaChange, b: sq.RequestedServiceQuotaChange) {
  return a.Created!.getTime() - b.Created!.getTime();
}
