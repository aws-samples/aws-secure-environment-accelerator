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
        description = tr('labels.array_element', { index: fragment });
      } else if (parent.rawType instanceof InterfaceType) {
        title = capitalCase(label);
      } else if (parent.rawType instanceof DictionaryType) {
        description = tr('labels.object_element', { key: fragment });
      }

      const parentTranslations = en.tr(parent.type);
      if (parentTranslations && isInterfaceTranslations(parentTranslations)) {
        const wrappedTranslations = parentTranslations.fields[fragment];
        title = wrappedTranslations?.title ?? title;
        description = wrappedTranslations?.description ?? description;
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
  };
  return <I18nContextC.Provider value={value}>{children}</I18nContextC.Provider>;
};

export function useI18n(): UseI18n {
  return useContext(I18nContextC)!;
}
