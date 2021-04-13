import * as t from 'io-ts';
import { Annotations } from './annotations';

export class AnnotatedType<T extends t.Any> extends t.Type<T['_A'], T['_O'], T['_I']> {
  constructor(readonly type: T, readonly annotations: Annotations) {
    super(`Annotated<${type.name}>`, type.is, type.validate, type.encode);
  }
}

export function annotate<T extends t.Any>(type: T, annotations: Annotations): AnnotatedType<T> {
  return new AnnotatedType<T>(type, annotations);
}
