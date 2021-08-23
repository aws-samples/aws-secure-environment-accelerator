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

import type { JSONSchema7 } from 'json-schema';
import { AnnotatedType } from '@aws-accelerator/io-ts-annotations';
import * as t from '@aws-accelerator/common-types';

export type { JSONSchema7 };

type Definition = JSONSchema7 & { optional?: boolean };

interface Context {
  definitions: JSONSchema7['definitions'];
  getOrCreateDefinition: (def: t.Any) => Definition;
}

function createContext(): Context {
  const definitions: Record<string, Definition> = {};
  const createDefinition = (name: string, definition: Definition): Definition => {
    definitions[name] = definition;
    return { $ref: `#/definitions/${name}` };
  };

  return {
    definitions,
    getOrCreateDefinition(type: t.Any) {
      const definition = toJsonDefinition(type, this);
      if (type instanceof t.InterfaceType && t.isDefinition(type)) {
        return createDefinition(type.definitionName, definition);
      } else if (type instanceof t.EnumType || type instanceof t.CidrType) {
        return createDefinition(type.name, definition);
      }
      return definition;
    },
  };
}

/**
 * Convert a superstruct Struct to a JSON schema.
 */
export function toJsonSchema(type: t.Any): JSONSchema7 {
  const context = createContext();
  const definition = context.getOrCreateDefinition(type);
  return {
    $schema: 'http://json-schema.org/schema#',
    definitions: context.definitions,
    ...definition,
  };
}

/**
 * Convert a superstruct Struct to a JSON definition.
 */
export function toJsonDefinition(type: t.Any, context: Context): Definition {
  if (type instanceof t.InterfaceType) {
    const properties: Record<string, JSONSchema7> = {};
    const required: string[] = [];
    for (const key of Object.keys(type.props)) {
      const subtype = type.props[key];
      const subtypeDefinition = context.getOrCreateDefinition(subtype);

      if (subtypeDefinition.optional) {
        // Remove 'optional' property to comply with JSON schema
        delete subtypeDefinition.optional;
      } else {
        // Or mark the property as required
        required.push(key);
      }

      // Add to object schema properties
      properties[key] = subtypeDefinition;
    }
    return {
      type: 'object',
      properties,
      required,
    };
  } else if (type instanceof t.UnionType) {
    // Filter out any undefined types
    const types = type.types.filter((u: t.Any) => !(u instanceof t.UndefinedType));
    const optional = type.types.length !== types.length;
    if (types.length === 1) {
      return {
        optional,
        ...context.getOrCreateDefinition(types[0]),
      };
    }
    return {
      oneOf: types.map((type: t.Any) => context.getOrCreateDefinition(type)),
      optional,
    };
  } else if (type instanceof t.OptionalType) {
    return {
      optional: true,
      ...context.getOrCreateDefinition(type.type),
    };
  } else if (type instanceof t.DictionaryType) {
    return {
      type: 'object',
      additionalProperties: context.getOrCreateDefinition(type.codomain),
    };
  } else if (type instanceof t.ArrayType) {
    return {
      type: 'array',
      items: context.getOrCreateDefinition(type.type),
    };
  } else if (type instanceof t.NumberType) {
    return {
      type: 'number',
    };
  } else if (type instanceof t.StringType) {
    return {
      type: 'string',
    };
  } else if (type instanceof t.BooleanType) {
    return {
      type: 'boolean',
    };
  } else if (type instanceof t.LiteralType) {
    return {
      const: type.value,
    };
  } else if (type instanceof t.EnumType) {
    return {
      enum: [...type.values],
    };
  } else if (type instanceof t.CidrType) {
    return {
      type: 'string',
      pattern:
        '^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\/(3[0-2]|[1-2][0-9]|[0-9]))?$',
    };
  } else if (type instanceof AnnotatedType) {
    return {
      ...context.getOrCreateDefinition(type.type),
      ...type.annotations,
    };
  } else if (type instanceof t.DefaultedType) {
    return {
      ...context.getOrCreateDefinition(type.type),
      default: type.defaultValue,
      optional: true,
    };
  } else if (type instanceof t.SizedType) {
    const minKey = type.type instanceof t.NumberType ? 'minimum' : 'minLength';
    const maxKey = type.type instanceof t.NumberType ? 'maximum' : 'maxLength';
    return {
      ...context.getOrCreateDefinition(type.type),
      [minKey]: type.min,
      [maxKey]: type.max,
    };
  }
  throw new Error(`Unsupported type ${type.name}`);
}
