/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import * as t from '@aws-accelerator/common-types';
import { SpaceBetween } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';
import {
  createAggregatedRenderer,
  FieldProps,
  FieldWrapperProps,
  rawTypeInstanceOf,
  TypeRenderer,
  TypeRendererCase,
} from '@/components/fields/field';
import { BooleanFormField } from '@/components/fields/boolean';
import { NumberFormField } from '@/components/fields/number';
import { StringFormField } from '@/components/fields/string';
import { SimpleFormFieldWrapper } from '@/components/node-field';
import { InterfaceFormField, InterfaceFormFieldProps } from '@/components/fields/interface';
import { ArrayFormField, ArrayFormFieldProps } from '@/components/fields/array';
import { DictionaryFormField, DictionaryFormFieldProps } from '@/components/fields/dictionary';
import { EnumFormField } from '@/components/fields/enum';

export const WizardFieldWrapper = (props: FieldWrapperProps<t.Any>) => {
  const { context, node } = props;
  const { tr } = useI18n();
  const { title } = tr(node);
  return (
    <SpaceBetween size="s" direction="horizontal">
      {props.children}
      <label>{context?.label ?? title}</label>
    </SpaceBetween>
  );
};

export const WizardInlineBooleanField: React.VFC<FieldProps<t.BooleanType>> = props => {
  return <BooleanFormField {...props} FieldWrapperC={WizardFieldWrapper} />;
};

export const WizardBooleanField: React.VFC<FieldProps<t.BooleanType>> = props => {
  return <BooleanFormField {...props} FieldWrapperC={SimpleFormFieldWrapper} />;
};

export const WizardNumberField: React.VFC<FieldProps<t.NumberType>> = props => {
  return <NumberFormField {...props} FieldWrapperC={SimpleFormFieldWrapper} />;
};

export const WizardStringField: React.VFC<FieldProps<t.StringType>> = props => {
  return <StringFormField {...props} FieldWrapperC={SimpleFormFieldWrapper} />;
};

export const WizardEnumField: React.VFC<FieldProps<t.EnumType<any>>> = props => {
  return <EnumFormField {...props} FieldWrapperC={SimpleFormFieldWrapper} />;
};

export const WizardInterfaceField = (props: InterfaceFormFieldProps) => {
  return <InterfaceFormField FieldC={WizardField} FieldWrapperC={SimpleFormFieldWrapper} divider={false} {...props} />;
};

export const WizardDictionaryField = (props: DictionaryFormFieldProps) => {
  return <DictionaryFormField FieldC={WizardField} FieldWrapperC={SimpleFormFieldWrapper} {...props} />;
};

export const WizardArrayField = (props: ArrayFormFieldProps) => {
  return <ArrayFormField FieldC={WizardField} FieldWrapperC={SimpleFormFieldWrapper} spaceBetween="m" {...props} />;
};

const wizardTypeRendererSwitch: TypeRendererCase<any>[] = [
  { condition: rawTypeInstanceOf(t.BooleanType), Renderer: WizardInlineBooleanField },
  { condition: rawTypeInstanceOf(t.NumberType), Renderer: WizardNumberField },
  { condition: rawTypeInstanceOf(t.StringType), Renderer: WizardStringField },
  { condition: rawTypeInstanceOf(t.CidrType), Renderer: WizardStringField },
  { condition: rawTypeInstanceOf(t.EnumType), Renderer: WizardEnumField },
  { condition: rawTypeInstanceOf(t.ArrayType), Renderer: WizardArrayField },
  { condition: rawTypeInstanceOf(t.DictionaryType), Renderer: WizardDictionaryField },
  { condition: rawTypeInstanceOf(t.InterfaceType), Renderer: WizardInterfaceField },
];

/**
 * The nested renderer that delegates to the correct renderer based on entries in `nestedTypeRendererEntries`.
 */
export const WizardField: TypeRenderer<t.Any> = createAggregatedRenderer(wizardTypeRendererSwitch);

export const extendWizardField = (cases: TypeRendererCase<any>[]): TypeRenderer<t.Any> =>
  createAggregatedRenderer([...cases, ...wizardTypeRendererSwitch]);
