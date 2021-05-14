/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import * as t from '@aws-accelerator/common-types';
import { TypeTreeNode } from '@/types';
import { StringField } from './string';
import { ArrayField } from './array';
import { InterfaceField } from './interface';
import { UnionField } from './union';
import { BooleanField } from './boolean';
import { NumberField } from './number';
import { EnumField } from './enum';
import { LinkField } from './link';
import { CidrField } from './cidr';
import { DictionaryField } from './dictionary';
import { LiteralField } from './literal';

export type Fragment = string | number;
export type Path = readonly Fragment[];

export interface FieldProps<T extends t.Any = t.Any> {
  readonly state: any;
  readonly node: TypeTreeNode<T>;
  readonly className?: string;
}

/**
 * This interface defines a React component that renders a type.
 */
export type TypeRenderer<T extends t.Any> = React.VoidFunctionComponent<FieldProps<T>>;

export interface TypeRendererCase<T extends t.Any> {
  condition(t: t.Any): boolean;
  Renderer: TypeRenderer<T>;
}

/**
 * List of type renderer entries. Every entry has a condition and defines a renderer that should be used to render if the condition is true.
 */
const typeRendererSwitch: TypeRendererCase<any>[] = [
  { condition: isOfType(t.LiteralType), Renderer: LiteralField },
  { condition: isOfType(t.BooleanType), Renderer: BooleanField },
  { condition: isOfType(t.NumberType), Renderer: NumberField },
  { condition: isOfType(t.StringType), Renderer: StringField },
  { condition: isOfType(t.CidrType), Renderer: CidrField },
  { condition: isOfType(t.EnumType), Renderer: EnumField },
  { condition: isOfType(t.UnionType), Renderer: UnionField },
  { condition: isOfType(t.ArrayType), Renderer: LinkField },
  { condition: isOfType(t.InterfaceType), Renderer: LinkField },
  { condition: isOfType(t.DictionaryType), Renderer: LinkField },
];

/**
 * Function that returns a function that returns a renderer for the given type.
 */
function createGetFieldRenderer(entries: TypeRendererCase<t.Any>[]): (type: t.Any) => TypeRenderer<t.Any> {
  return (type: t.Any) => {
    const entry = entries.find(({ condition: match }) => match(type));
    const Renderer = entry?.Renderer ?? UnknownTypeRenderer;
    return Renderer;
  };
}

/**
 * The default renderer that delegates to the correct renderer based on entries in `typeRendererEntries`.
 */
export const Field: TypeRenderer<t.Any> = createAggregatedRenderer(typeRendererSwitch);
export const getFieldRenderer = createGetFieldRenderer(typeRendererSwitch);

const nestedTypeRendererSwitch: TypeRendererCase<any>[] = [
  { condition: isOfType(t.InterfaceType), Renderer: InterfaceField },
  { condition: isOfType(t.ArrayType), Renderer: ArrayField },
  { condition: isOfType(t.DictionaryType), Renderer: DictionaryField },
  ...typeRendererSwitch,
];

/**
 * The nested renderer that delegates to the correct renderer based on entries in `nestedTypeRendererEntries`.
 */
export const NestedField: TypeRenderer<t.Any> = createAggregatedRenderer(nestedTypeRendererSwitch);
export const getNestedFieldRenderer = createGetFieldRenderer(nestedTypeRendererSwitch);

/**
 * Returns a function that returns true when a type is an instance of a given type.
 */
export function isOfType<T extends t.Any>(type: new (...args: any[]) => T) {
  return (t: t.Any): t is T => t instanceof type;
}

const UnknownTypeRenderer: TypeRenderer<t.Any> = ({ node }) => <span>Unsupported field {node.rawType.name}</span>;

/**
 * Returns a function that returns a the matching renderer for the given props.
 */
function createAggregatedRenderer(entries: TypeRendererCase<t.Any>[]): TypeRenderer<t.Any> {
  return (props: FieldProps<t.Any>) => {
    const entry = entries.find(({ condition: match }) => match(props.node.rawType));
    const Renderer = entry?.Renderer ?? UnknownTypeRenderer;
    return <Renderer {...props} />;
  };
}
