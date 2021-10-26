import type { JSONSchema7 } from 'json-schema';
import { TypeTranslations } from '@aws-accelerator/config-i18n';
import * as t from '@aws-accelerator/common-types';

export type { JSONSchema7 };

type Definition = JSONSchema7 & { optional?: boolean };

interface Context {
  definitions: JSONSchema7['definitions'];
  getOrCreateDefinition: (def: t.Any) => Definition;
}

function createContext(tr: (type: t.Any) => TypeTranslations<t.Any> | undefined): Context {
  const definitions: Record<string, Definition> = {};
  const createDefinition = (name: string, definition: Definition): Definition => {
    definitions[name] = definition;
    return { $ref: `#/definitions/${name}` };
  };

  return {
    definitions,
    getOrCreateDefinition(type: t.Any) {
      const definition = toJsonDefinition(type, tr, this);
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
export function toJsonSchema(type: t.Any, tr: (type: t.Any) => TypeTranslations<t.Any> | undefined): JSONSchema7 {
  const context = createContext(tr);
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
export function toJsonDefinition(
  type: t.Any,
  tr: (type: t.Any) => TypeTranslations<t.Any> | undefined,
  context: Context,
): Definition {
  const translation = tr(type);
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
      ...translation,
    };
  } else if (type instanceof t.UnionType) {
    // Filter out any undefined types
    const types = type.types.filter((u: t.Any) => !(u instanceof t.UndefinedType));
    const optional = type.types.length !== types.length;
    if (types.length === 1) {
      return {
        optional,
        ...translation,
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
      ...translation,
    };
  } else if (type instanceof t.ArrayType) {
    return {
      type: 'array',
      items: context.getOrCreateDefinition(type.type),
      ...translation,
    };
  } else if (type instanceof t.NumberType) {
    return {
      type: 'number',
      ...translation,
    };
  } else if (type instanceof t.StringType) {
    return {
      type: 'string',
      ...translation,
    };
  } else if (type instanceof t.BooleanType) {
    return {
      type: 'boolean',
      ...translation,
    };
  } else if (type instanceof t.LiteralType) {
    return {
      const: type.value,
      ...translation,
    };
  } else if (type instanceof t.EnumType) {
    return {
      enum: [...type.values],
      ...translation,
    };
  } else if (type instanceof t.CidrType) {
    return {
      type: 'string',
      pattern:
        '^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\/(3[0-2]|[1-2][0-9]|[0-9]))?$',
      ...translation,
    };
  } else if (type instanceof t.DefaultedType) {
    return {
      ...context.getOrCreateDefinition(type.type),
      default: type.defaultValue,
      optional: true,
      ...translation,
    };
  } else if (type instanceof t.SizedType) {
    const minKey = type.type instanceof t.NumberType ? 'minimum' : 'minLength';
    const maxKey = type.type instanceof t.NumberType ? 'maximum' : 'maxLength';
    return {
      ...context.getOrCreateDefinition(type.type),
      [minKey]: type.min,
      [maxKey]: type.max,
      ...translation,
    };
  }
  throw new Error(`Unsupported type ${type.name}`);
}
