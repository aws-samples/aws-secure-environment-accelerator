import * as t from 'io-ts';
import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import {
  StructuredValue,
  StructuredValueFindProps,
  findValuesFromOutputs,
  findValueFromOutputs,
} from '@aws-pbmm/common-outputs/lib/structured-output';

export interface StructuredOutputProps<T> {
  type: t.Type<T>;
  value: T;
}

export interface StructuredOutputFilter<T> {
  type: t.Type<T>;
  accountKey?: string;
}

export type CfnStructuredOutputFindProps<T> = Omit<StructuredValueFindProps<T>, 'type'>;

export abstract class CfnStructuredOutput<T> extends cdk.Construct {}

export interface CfnStructuredOutputClass<T> {
  new (scope: cdk.Construct, id: string, value: T): CfnStructuredOutput<T>;

  findOne(filter: CfnStructuredOutputFindProps<T>): T;
  findAll(filter: CfnStructuredOutputFindProps<T>): T[];
}

export function createCfnStructuredOutput<T>(type: t.Type<T>): CfnStructuredOutputClass<T> {
  class Impl extends CfnStructuredOutput<T> {
    constructor(scope: cdk.Construct, id: string, value: T) {
      super(scope, id);

      new StructuredOutput(this, 'Output', {
        type,
        value,
      });
    }

    static findOne(filter: CfnStructuredOutputFindProps<T>): T {
      return findValueFromOutputs({ ...filter, type });
    }

    static findAll(filter: CfnStructuredOutputFindProps<T>): T[] {
      return findValuesFromOutputs({ ...filter, type });
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
