import * as t from '@aws-accelerator/common-types';

/**
 * Translation definition that is used as base for all other translations.
 */
export interface FieldTranslations {
  title?: string;
  description?: string;
  url?: string;
}

export type InterfaceFieldTranslations<P, K extends keyof P> = P[K] extends t.InterfaceType<any>
  ? FieldTranslations | undefined | never
  : FieldTranslations;

/**
 * Translation definition for interface types.
 *
 * @template P The properties type of the interface type.
 */
export interface InterfaceTranslations<P> extends FieldTranslations {
  fields: {
    [K in keyof P]: FieldTranslations;
  };
}

/**
 * Translation definition for enum types.
 *
 * @template E The enum values type of the enum type.
 */
export interface EnumTranslations<E extends string | number> extends FieldTranslations {
  enumLabels?: Partial<Record<E, string>>;
}

/**
 * Translation definition for sized types.
 */
export interface SizedTranslations extends FieldTranslations {
  errorMessage?: string;
}

/**
 * Helper type that delegates to the correct translation definition based on the type.
 */
export type TypeTranslations<T> = T extends t.InterfaceType<infer P>
  ? InterfaceTranslations<P>
  : T extends t.EnumType<infer P>
  ? EnumTranslations<P>
  : T extends t.SizedType<any, any>
  ? SizedTranslations
  : FieldTranslations;

export interface I18nTranslations {
  menu: {};
  import: {
    title: string;
  };
  languages: { [key: string]: string };
}

export type I18nKey =
  | `menu.${keyof I18nTranslations['menu']}`
  | `import.${keyof I18nTranslations['import']}`
  | `languages.${keyof I18nTranslations['languages']}`;

/**
 * Translation interface for a specific language.
 */
export interface Translation {
  languageCode: string;
  translations: I18nTranslations;
  add<T extends t.Any>(type: T, translations: TypeTranslations<T>): this;
  tr<T extends t.Any>(type: T): TypeTranslations<T> | undefined;
}

/**
 * Function that creates a new translation for the given language code.
 */
export function translation(languageCode: string, translations: I18nTranslations): Translation {
  const typeTranslations = new Map<t.Any, FieldTranslations>();
  return {
    languageCode,
    translations,
    /**
     * Add a translation for a given type.
     */
    add<T extends t.Any>(type: T, translations: TypeTranslations<T>) {
      typeTranslations.set(type, copyOmitEmpty(translations)!);
      return this;
    },
    /**
     * Find the translations for a given type.
     */
    tr<T extends t.Any>(type: T) {
      return typeTranslations.get(type) as TypeTranslations<T>;
    },
  };
}

export function isInterfaceTranslations(value: FieldTranslations): value is InterfaceTranslations<any> {
  return 'fields' in value;
}

/**
 * Copy an object and omit empty values.
 */
function copyOmitEmpty<T>(value: T): T | undefined {
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, value]) => [key, copyOmitEmpty(value)])
        .filter(([, value]) => value != null),
    );
  } else if (typeof value === 'string') {
    return isStringEmpty(value) ? undefined : value;
  }
  throw new Error(`Unknown type ${typeof value}`);
}

function isStringEmpty(value: string) {
  return value.length === 0;
}
