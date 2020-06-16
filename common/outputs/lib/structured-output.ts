import * as t from 'io-ts';
import { PathReporter } from 'io-ts/lib/PathReporter';
import { isLeft } from 'fp-ts/lib/Either';
import { StackOutput } from './stack-output';

export interface StructuredValue<T> {
  type: string;
  value: T;
}

export interface StructuredValueFindProps<T> {
  outputs: StackOutput[];
  type: t.Type<T>;
  accountKey?: string;
  predicate?: (value: T) => boolean;
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
  } catch {}
}

export function parse<S, T>(type: t.Decoder<S, T>, content: S): T {
  const result = type.decode(content);
  if (isLeft(result)) {
    const errors = PathReporter.report(result).map(error => `* ${error}`);
    const errorMessage = errors.join('\n');
    throw new Error(`Could not parse content:\n${errorMessage}`);
  }
  return result.right;
}
