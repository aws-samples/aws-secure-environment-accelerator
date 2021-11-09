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

import { AWSError, Request } from 'aws-sdk';
import { collectAsync } from '../util/generator';
import { delay } from '../util/delay';
import { throttlingBackOff } from './backoff';

export type WithNextToken = { NextToken?: string };

export type Requester<Input, Response> = (value: Input) => Request<Response, AWSError>;

export async function listWithNextToken<Input extends WithNextToken, Response extends WithNextToken, Value>(
  requester: Requester<Input, Response>,
  values: (response: Response) => Value[],
  input: Input,
): Promise<Value[]> {
  return collectAsync(listWithNextTokenGenerator(requester, values, input));
}

export async function* listWithNextTokenGenerator<Input extends WithNextToken, Response extends WithNextToken, Value>(
  requester: Requester<Input, Response>,
  values: (response: Response) => Value[],
  input: Input,
): AsyncIterable<Value> {
  let token: string | undefined;
  do {
    if (token) {
      // Throttle requests
      await delay(1000);
    }

    const response: Response = await throttlingBackOff(() =>
      requester({
        ...input,
        NextToken: token,
      }).promise(),
    );
    token = response.NextToken;
    yield* values(response);
  } while (token !== undefined);
}
