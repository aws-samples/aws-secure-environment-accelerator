import * as t from 'io-ts';
import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { StructuredValue, findValuesFromOutputs } from '@aws-pbmm/common-outputs/lib/structured-output';

export interface StructuredOutputProps<T> {
  type: t.Type<T>;
  value: T;
}

export interface StructuredOutputFilter<T> {
  type: t.Type<T>;
  accountKey?: string;
}

export type CfnStructuredOutputClass<T> = new (scope: cdk.Construct, id: string, value: T) => cdk.Construct;

export function createCfnStructuredOutput<T>(type: t.Type<T>): CfnStructuredOutputClass<T> {
  class Impl extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, value: T) {
      super(scope, id);

      new StructuredOutput(this, 'Output', {
        type,
        value,
      });
    }
  }
  return Impl;
}

/**
 * Wrapper around JsonOutputValue that uses io-ts to encode and decode data in the JSON output value.
 */
export class StructuredOutput<T> extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: StructuredOutputProps<T>) {
    super(scope, id);

    const value: StructuredValue<T> = {
      type: props.type.name,
      value: props.value,
    };
    new cdk.CfnOutput(this, 'Output', {
      value: JSON.stringify(value),
    });
  }

  static fromOutputs<T>(outputs: StackOutput[], filter: StructuredOutputFilter<T>): T[] {
    return findValuesFromOutputs({
      outputs,
      type: filter.type,
      accountKey: filter.accountKey,
    });
  }
}
