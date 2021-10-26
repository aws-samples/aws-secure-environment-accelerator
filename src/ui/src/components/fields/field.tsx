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
import React from 'react';
import * as t from '@aws-accelerator/common-types';
import { TypeTreeNode } from '@/types';
import { AutosuggestStringFormField } from './string';
import { ArrayFormField } from './array';
import { InterfaceFormField } from './interface';
import { UnionFormField } from './union';
import { BooleanFormField } from './boolean';
import { NumberFormField } from './number';
import { EnumFormField } from './enum';
import { LinkFormField } from './link';
import { CidrFormField } from './cidr';
import { DictionaryFormField } from './dictionary';
import { LiteralFormField } from './literal';
import { UseValidationProps } from './validation';

export type Fragment = string | number;
export type Path = readonly Fragment[];

export type FieldWrapperProps<T extends t.Any = t.Any> = React.PropsWithChildren<UseValidationProps<T>>;

export interface FieldProps<T extends t.Any = t.Any> {
  readonly state: any;
  readonly node: TypeTreeNode<T>;
  readonly context?: any;
  readonly className?: string;
  /**
   * @default false
   */
  readonly disabled?: boolean;
  /**
   * React component to render nested fields.
   */
  readonly FieldC?: React.VFC<FieldProps>;
  /**
   * React component to wrap the field in.
   */
  readonly FieldWrapperC?: React.FC<FieldWrapperProps>;
}

/**
 * This interface defines a React component that renders a type.
 */
export type TypeRenderer<T extends t.Any> = React.VFC<FieldProps<T>>;

export interface TypeRendererCase<T extends t.Any> {
  condition(props: FieldProps<t.Any>): boolean;
  Renderer: TypeRenderer<T>;
}

/**
 * List of type renderer entries. Every entry has a condition and defines a renderer that should be used to render if the condition is true.
 */
const typeRendererSwitch: TypeRendererCase<any>[] = [
  { condition: rawTypeInstanceOf(t.LiteralType), Renderer: LiteralFormField },
  { condition: rawTypeInstanceOf(t.BooleanType), Renderer: BooleanFormField },
  { condition: rawTypeInstanceOf(t.NumberType), Renderer: NumberFormField },
  { condition: rawTypeInstanceOf(t.StringType), Renderer: AutosuggestStringFormField },
  { condition: rawTypeInstanceOf(t.CidrType), Renderer: CidrFormField },
  { condition: rawTypeInstanceOf(t.EnumType), Renderer: EnumFormField },
  { condition: rawTypeInstanceOf(t.UnionType), Renderer: UnionFormField },
  { condition: rawTypeInstanceOf(t.ArrayType), Renderer: LinkFormField },
  { condition: rawTypeInstanceOf(t.InterfaceType), Renderer: LinkFormField },
  { condition: rawTypeInstanceOf(t.DictionaryType), Renderer: LinkFormField },
];

/**
 * The default renderer that delegates to the correct renderer based on entries in `typeRendererEntries`.
 */
export const Field: TypeRenderer<t.Any> = createAggregatedRenderer(typeRendererSwitch);

const nestedTypeRendererSwitch: TypeRendererCase<any>[] = [
  { condition: rawTypeInstanceOf(t.InterfaceType), Renderer: InterfaceFormField },
  { condition: rawTypeInstanceOf(t.ArrayType), Renderer: ArrayFormField },
  { condition: rawTypeInstanceOf(t.DictionaryType), Renderer: DictionaryFormField },
  ...typeRendererSwitch,
];

/**
 * The nested renderer that delegates to the correct renderer based on entries in `nestedTypeRendererEntries`.
 */
export const NestedField: TypeRenderer<t.Any> = createAggregatedRenderer(nestedTypeRendererSwitch);

/**
 * Returns a function that returns true when a type equals the given type.
 */
export function typeEquals(type: t.Any) {
  return (props: FieldProps<t.Any>): boolean => props.node.type === type;
}

/**
 * Returns a function that returns true when a raw type equals the given type.
 */
export function rawTypeEquals(type: t.Any) {
  return (props: FieldProps<t.Any>): boolean => props.node.rawType === type;
}

/**
 * Returns a function that returns true when a type is an instance of a given type.
 */
export function rawTypeInstanceOf<T extends t.Any>(type: new (...args: any[]) => T) {
  return (props: FieldProps<t.Any>): props is FieldProps<T> => props.node.rawType instanceof type;
}

export const UnknownTypeRenderer: TypeRenderer<t.Any> = ({ node }) => (
  <span>Unsupported field {node.rawType.name}</span>
);

/**
 * Returns a function that returns a the matching renderer for the given props.
 */
export function createAggregatedRenderer(entries: TypeRendererCase<any>[]): TypeRenderer<t.Any> {
  return (props: FieldProps<t.Any>) => {
    const entry = entries.find(({ condition }) => condition(props));
    const Renderer = entry?.Renderer ?? UnknownTypeRenderer;
    return <Renderer {...props} />;
  };
}
