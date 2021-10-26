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

import * as t from 'io-ts';
import { StackOutput } from './stack-output';
import { parse } from '@aws-accelerator/common-types';

export interface StructuredValue<T> {
  type: string;
  value: T;
}

export interface StructuredValueFindProps<T> {
  outputs: StackOutput[];
  type: t.Type<T>;
  accountKey?: string;
  region?: string;
  predicate?: (value: T) => boolean;
}

export type StructureValueFinderProps<T> = Omit<StructuredValueFindProps<T>, 'type'>;

export interface StructuredValueFinder<T> {
  tryFindOne(filter: StructureValueFinderProps<T>): T | undefined;
  findOne(filter: StructureValueFinderProps<T>): T;
  findAll(filter: StructureValueFinderProps<T>): T[];
}

/**
 * Creates an interface StructuredValueFinder<T> that can be extended using the extend parameter.
 */
export function createStructuredOutputFinder<T, X = {}>(
  type: t.Type<T>,
  extend: (finder: StructuredValueFinder<T>) => X,
): StructuredValueFinder<T> & X {
  const finder = {
    tryFindOne: (filter: StructureValueFinderProps<T>): T | undefined => {
      return tryFindValueFromOutputs({ ...filter, type });
    },
    findOne: (filter: StructureValueFinderProps<T>): T => {
      return findValueFromOutputs({ ...filter, type });
    },
    findAll: (filter: StructureValueFinderProps<T>): T[] => {
      return findValuesFromOutputs({ ...filter, type });
    },
  };
  const extension = extend ? extend(finder) : undefined;
  // eslint-disable-next-line prefer-object-spread
  return Object.assign(finder, extension);
}

export function tryFindValueFromOutputs<T>(props: StructuredValueFindProps<T>): T | undefined {
  const values = findValuesFromOutputs(props);
  return values?.[0];
}

export function findValueFromOutputs<T>(props: StructuredValueFindProps<T>): T {
  const values = findValuesFromOutputs(props);
  if (values.length !== 1) {
    throw new Error(`Cannot find single value of type ${props.type.name}. Found ${values.length} values instead`);
  }
  return values[0];
}

export function findValuesFromOutputs<T>(props: StructuredValueFindProps<T>): T[] {
  const values = props.outputs
    .filter(output => props.accountKey === undefined || output.accountKey === props.accountKey)
    .filter(output => props.region === undefined || output.region === props.region)
    .map(output => parseValueFromOutput(output, props.type))
    .filter((structured): structured is T => !!structured);
  if (props.predicate) {
    return values.filter(props.predicate);
  }
  return values;
}

export function parseValueFromOutput<T>(output: StackOutput, type: t.Type<T>): T | undefined {
  try {
    if (output.outputValue && output.outputValue.startsWith('{')) {
      const json = JSON.parse(output.outputValue);
      if (type.name === json.type) {
        return parse(type, json.value);
      }
    }
  } catch (e) {
    console.warn(`Unable to parse output: ${e}`);
  }
}
