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
import i18next, { i18n, StringMap, TOptions } from 'i18next';
import { capitalCase } from 'capital-case';
import { createContext, FC, useContext, useState } from 'react';
import { ArrayType, DictionaryType, InterfaceType } from '@aws-accelerator/common-types';
import { fr, en, isInterfaceTranslations, Translation, I18nKey } from '@aws-accelerator/config-i18n';
import { TypeTreeNode } from '@/types';

export interface NodeTranslations {
  label?: string;
  title: string;
  description?: string;
}

export interface UseI18n {
  i18n: i18n;
  tr(node: TypeTreeNode): NodeTranslations;
  tr(key: I18nKey | I18nKey[], options?: TOptions<StringMap>): string;
  currency(value: number, currency?: string): string;
}

const I18nContextC = createContext<UseI18n | undefined>(undefined);

const translations: Record<string, Translation> = { en, fr };

void i18next.init({
  lng: 'en',
  fallbackLng: ['en', 'fr'],
  resources: {
    en: { translation: en.translations },
    fr: { translation: fr.translations },
  },
});

/**
 * Context provider that provides Accelerator configuration object.
 */
export const I18nProvider: FC = ({ children }) => {
  // TODO Store language in local storage
  const [translation, setTranslation] = useState<Translation>(translations[i18next.language]);

  // Listen to i18next language changes
  i18next.on('languageChanged', () => {
    setTranslation(translations[i18next.language]);
  });

  function tr(node: TypeTreeNode): NodeTranslations;
  function tr(key: I18nKey | I18nKey[] | TypeTreeNode, options?: TOptions<StringMap>): string;
  function tr(): NodeTranslations | string {
    const argv0 = arguments[0];
    if (typeof argv0 === 'string' || Array.isArray(argv0)) {
      return i18next.t(argv0, arguments[1]);
    }
    return getNodeTranslations(argv0);
  }

  function getNodeTranslations(node: TypeTreeNode): NodeTranslations {
    const { parent } = node;
    const typeTranslations = translation.tr(node.type);
    let label;
    let title;
    let description;
    let fragment;
    if (parent) {
      fragment = node.path[node.path.length - 1];

      label = `${fragment}`;
      if (parent.rawType instanceof ArrayType) {
        title = getNodeTranslations(parent)?.title;
        description = tr('labels.array_element', { index: fragment });
      } else if (parent.rawType instanceof InterfaceType) {
        title = capitalCase(label);

        const parentTranslations = en.tr(parent.type);
        if (parentTranslations && isInterfaceTranslations(parentTranslations)) {
          const wrappedTranslations = parentTranslations.fields[fragment];
          title = wrappedTranslations?.title ?? title;
          description = wrappedTranslations?.description ?? description;
        }
      } else if (parent.rawType instanceof DictionaryType) {
        description = tr('labels.object_element', { key: fragment });
      }
    }
    return {
      label,
      title: title ?? node.type.name,
      description,
      ...typeTranslations,
    };
  }

  const value: UseI18n = {
    i18n: i18next,
    tr,
    currency: translation.currency.bind(translation),
  };
  return <I18nContextC.Provider value={value}>{children}</I18nContextC.Provider>;
};

export function useI18n(): UseI18n {
  return useContext(I18nContextC)!;
}
