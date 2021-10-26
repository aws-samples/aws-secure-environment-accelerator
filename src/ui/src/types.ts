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

/* eslint-disable @typescript-eslint/no-explicit-any */
import get from 'lodash.get';
import set from 'lodash.set';
import * as t from '@aws-accelerator/common-types';
import { Fragment, Path } from '@/components/fields';

/**
 * Auxiliary interface that defines a node in a type tree.
 */
export interface TypeTreeNode<T extends t.Any = t.Any> {
  /**
   * The parent node.
   */
  readonly parent?: TypeTreeNode;
  /**
   * The path of this node in the type tree.
   */
  readonly path: Path;
  /**
   * The type of this node.
   */
  readonly type: t.Any;
  /**
   * The underlying raw type of this node.
   */
  readonly rawType: T;
  /**
   * The metadata that was extracted from the type.
   */
  readonly metadata: TypeMetadata;
  /**
   * Return a child node at the given path fragment.
   */
  nested<S extends t.Any>(fragment: Fragment): TypeTreeNode<S>;
  /**
   * Get the value of the current node in the given state.
   */
  get(state: any): t.TypeOf<T>;
  /**
   * Set the value of the current node in the given state to the given value.
   */
  set(state: any, value: t.TypeOf<T> | undefined): void;
}

export interface TypeMetadata {
  readonly defaultValue?: any;
  readonly enumLabels?: Record<string | number, string>;
  readonly optional?: boolean;
  readonly min?: number;
  readonly max?: number;
}

export type RawType =
  | t.UnknownType
  | t.UndefinedType
  | t.LiteralType<any>
  | t.BooleanType
  | t.NumberType
  | t.StringType
  | t.CidrType
  | t.EnumType<any>
  | t.ArrayType<any>
  | t.InterfaceType<any>
  | t.UnionType<any>
  | t.DictionaryType<any, any>;

export type RawTypeOf<T extends t.Any> = T extends t.DefaultedType<infer S>
  ? RawTypeOf<S>
  : T extends t.OptionalType<infer S>
  ? RawTypeOf<S>
  : T extends t.SizedType<any, infer S>
  ? RawTypeOf<S>
  : T extends t.InterfaceType<any>
  ? T
  : T extends t.DictionaryType<any, any>
  ? T
  : T extends t.UnionType<any>
  ? T
  : T extends t.ArrayType<any>
  ? T
  : T extends t.EnumType<any>
  ? T
  : T extends t.CidrType
  ? T
  : T extends t.StringType
  ? T
  : T extends t.NumberType
  ? T
  : T extends t.BooleanType
  ? T
  : T extends t.LiteralType<any>
  ? T
  : T extends t.UndefinedType
  ? T
  : t.UnknownType;

export function isRawType(type: t.Any): type is RawType {
  return (
    type instanceof t.UndefinedType ||
    type instanceof t.LiteralType ||
    type instanceof t.BooleanType ||
    type instanceof t.NumberType ||
    type instanceof t.StringType ||
    type instanceof t.CidrType ||
    type instanceof t.EnumType ||
    type instanceof t.ArrayType ||
    type instanceof t.InterfaceType ||
    type instanceof t.UnionType ||
    type instanceof t.DictionaryType
  );
}

/**
 * Find the raw type and its metadata for given type. The metadata that is found in wrapping types -- such as Annotated Type, SizedType, DefaultedType -- are added to the resulting metadata.
 *
 * @param type The original type.
 * @param metadata The initial metadata to use.
 * @returns
 */
export function getRawType(type: t.Any, metadata: TypeMetadata = {}): { type: RawType; metadata: TypeMetadata } {
  if (type instanceof t.SizedType) {
    return getRawType(type.type, {
      ...metadata,
      min: type.min,
      max: type.max,
    });
  } else if (type instanceof t.DefaultedType) {
    return getRawType(type.type, {
      ...metadata,
      defaultValue: type.defaultValue,
    });
  } else if (type instanceof t.OptionalType) {
    return getRawType(type.type, {
      ...metadata,
      optional: true,
    });
  } else if (type instanceof t.StringType) {
    return {
      type,
      metadata: {
        defaultValue: '',
        ...metadata,
      },
    };
  } else if (type instanceof t.BooleanType) {
    return {
      type,
      metadata: {
        defaultValue: false,
        ...metadata,
      },
    };
  } else if (type instanceof t.NumberType) {
    return {
      type,
      metadata: {
        defaultValue: 0,
        ...metadata,
      },
    };
  } else if (type instanceof t.ArrayType) {
    const { metadata: valueMetadata } = getRawType(type.type);
    return {
      type,
      metadata: {
        // Use the metadata of the values in the array as default
        ...valueMetadata,
        ...metadata,
      },
    };
  } else if (isRawType(type)) {
    return {
      type,
      metadata,
    };
  }
  throw new Error(`Cannot find raw type of type ${type.name}`);
}

function notNestable(type: t.Any) {
  return () => {
    throw new Error(`Cannot get nested field of unnested type ${type.name}`);
  };
}

/**
 * This function creates a TypeTreeNode for the given type.
 *
 * @param type The root type.
 * @param initialPath
 * @returns
 */
export function getTypeTree(type: t.Any, initialPath: Path = []): TypeTreeNode {
  // Recursive inner function to build the type tree
  function rec({
    type,
    treePath,
    statePath,
    additionalMetadata,
    parent,
  }: {
    type: t.Any;
    treePath: Path;
    statePath: Path;
    additionalMetadata?: TypeMetadata;
    parent?: TypeTreeNode;
  }): TypeTreeNode {
    const { type: rawType, metadata } = getRawType(type, additionalMetadata);

    // This is the final node object
    // We already construct it here so we can pass the node down as parent to child nodes
    const node: TypeTreeNode = {
      parent,
      type,
      rawType,
      path: treePath,
      metadata,
      get: (state: any) => get(state, statePath),
      set: (state: any, value: any) => set(state, statePath, value),
      nested: notNestable(type),
    };

    if (rawType instanceof t.InterfaceType) {
      // @ts-ignore
      node.nested = (key: Fragment) => {
        const subtype = rawType.props[key];
        if (!subtype) {
          throw new Error(`Cannot find interface nested type at ${[...treePath, key].join('.')}`);
        }
        return rec({
          parent: node,
          type: subtype,
          treePath: [...treePath, key],
          statePath: [...statePath, key],
        });
      };
    } else if (rawType instanceof t.ArrayType) {
      // @ts-ignore
      node.nested = (key: Fragment) =>
        rec({
          parent: node,
          type: rawType.type,
          treePath: [...treePath, key],
          statePath: [...statePath, key],
        });
    } else if (rawType instanceof t.DictionaryType) {
      // @ts-ignore
      node.nested = (key: Fragment) =>
        rec({
          parent: node,
          type: rawType.codomain,
          treePath: [...treePath, key],
          statePath: [...statePath, key],
        });
    } else if (rawType instanceof t.UnionType) {
      // @ts-ignore
      node.nested = (key: Fragment) => {
        const subtype = rawType.types[key];
        if (!subtype) {
          throw new Error(`Cannot find union nested type at ${[...treePath, key].join('.')}`);
        }
        return rec({
          parent: node,
          type: rawType.types[key as number],
          treePath: [...treePath, key],
          statePath, // `statePath` remains the same for union
        });
      };
    }
    return node;
  }
  return rec({
    type,
    treePath: initialPath,
    statePath: initialPath,
  });
}

export function getNodeAtPath<T extends t.Any = t.Any>(node: TypeTreeNode, path: Path): TypeTreeNode<T> {
  let current = node;
  for (const fragment of path) {
    current = current.nested(fragment);
  }
  return current as TypeTreeNode<T>;
}
