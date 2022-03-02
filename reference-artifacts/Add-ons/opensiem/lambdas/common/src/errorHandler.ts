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

/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/no-explicit-any */
import https from 'https';
import { parse } from 'url';
import { backOff } from 'exponential-backoff';
import { CloudFormationCustomResourceEvent, Context, CloudFormationCustomResourceResponse } from 'aws-lambda';

export const SUCCESS = 'SUCCESS';
export const FAILED = 'FAILED';

export type ResponseStatus = typeof SUCCESS | typeof FAILED;

export type ResponseData = { [key: string]: any };

export interface Response {
  status: ResponseStatus;
  reason?: string;
  data?: ResponseData;
  physicalResourceId?: string;
  retries?: number;
}

export async function send(event: CloudFormationCustomResourceEvent, context: Context, response: Response) {
  const { status, reason, data, physicalResourceId, retries = 3 } = response;

  const cfnResponse: CloudFormationCustomResourceResponse = {
    Status: status,
    Reason: reason || `See CloudWatch Log Stream: ${context.logStreamName}`,
    PhysicalResourceId: physicalResourceId || context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  };

  const responseBody = JSON.stringify(cfnResponse);

  const parsedUrl = parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': responseBody.length,
    },
  };

  await backOff(
    () => {
      return new Promise((resolve, reject) => {
        const request = https.request(options, response => {
          console.log('Status code: ' + response.statusCode);
          console.log('Status message: ' + response.statusMessage);
          resolve(response.statusCode);
        });

        request.on('error', error => {
          console.log('send(..) failed executing https.request(..): ' + error);
          reject(error);
        });

        request.on('response', response => {
          if (response.statusCode! >= 400) {
            console.log(`Found status code ${response.statusCode} - retrying: ` + response.statusMessage);
            reject(response.statusMessage);
          }
        });

        request.write(responseBody);
        request.end();
      });
    },
    {
      numOfAttempts: retries,
    },
  );
}

export interface ErrorHandlerResponse {
  data?: ResponseData;
  physicalResourceId?: string;
}

/**
 * Auxiliary method that calls the given `onEvent` function, catches errors and sends the corresponding response to
 * CloudFormation.
 */
export function errorHandler(
  onEvent: (event: CloudFormationCustomResourceEvent) => Promise<ErrorHandlerResponse | undefined | void>,
) {
  return async (event: CloudFormationCustomResourceEvent, context: Context) => {
    try {
      const response = (await onEvent(event)) || undefined;

      console.debug('Sending successful response');
      console.debug(JSON.stringify(response, null, 2));

      await send(event, context, {
        status: SUCCESS,
        data: response?.data,
        physicalResourceId: response?.physicalResourceId,
      });
    } catch (e) {
      console.error('Sending failure response');
      console.error(e);

      await send(event, context, {
        status: FAILED,
        reason: e && e.toString(),
      });
    }
  };
}

export default send;
