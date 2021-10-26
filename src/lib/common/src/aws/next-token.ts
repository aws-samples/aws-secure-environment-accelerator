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
