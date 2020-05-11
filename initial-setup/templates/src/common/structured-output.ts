import * as t from 'io-ts';
import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { JsonOutputValue } from './json-output';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

export interface StructuredOutputProps<T> {
  type: t.Type<T>;
  value: T;
}

export interface StructuredOutputFilter<T> {
  type: t.Type<T>;
  accountKey?: string;
}

/**
 * Wrapper around JsonOutputValue that uses io-ts to encode and decode data in the JSON output value.
 */
export class StructuredOutput<T> extends JsonOutputValue {
  constructor(scope: cdk.Construct, id: string, props: StructuredOutputProps<T>) {
    super(scope, id, {
      type: props.type.name,
      value: () => {
        return props.value;
      },
    });
  }

  static fromOutputs<T>(outputs: StackOutput[], filter: StructuredOutputFilter<T>): T[] {
    return outputs
      .filter(output => !filter.accountKey || output.accountKey === filter.accountKey)
      .map(output => this.fromOutput(output, filter.type))
      .filter((structured): structured is T => !!structured);
  }

  static fromOutput<T>(output: StackOutput, type: t.Type<T>): T | undefined {
    try {
      if (output.outputValue && output.outputValue.startsWith('{')) {
        const json = JSON.parse(output.outputValue);
        if (type.name === json.type) {
          return c.parse(type, json.value);
        }
      }
    } catch {}
  }
}
