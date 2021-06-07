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
  menu: {
    accelerator_configuration: string;
    graphical_editor: string;
    code_editor: string;
    properties: string;
    wizard: string;
  };
  labels: {
    empty: string;
    codecommit_repository: string;
    codecommit_repository_description: string;
    codecommit_branch: string;
    codecommit_branch_description: string;
    codecommit_file: string;
    codecommit_file_description: string;
    export_as_file: string;
    export_introduction: string;
    configuration_is_valid: string;
    array_element: string;
    object_element: string;
    required: string;
    toggle_replacement: string;
    loading: string;
    selected_configuration_is_valid: string;
    import_with_errors: string;
    import_with_errors_description: string;
    import_configuration_introduction: string;
    configuration_file: string;
    configuration_file_description: string;
    configuration_file_constraint: string;
    choose_language: string;
  };
  headers: {
    add_dictionary_field: string;
    configure_credentials: string;
    import_configuration: string;
    export_configuration: string;
    choose_codecommit_file: string;
    import_codecommit: string;
    import_file: string;
  };
  buttons: {
    add: string;
    export: string;
    remove: string;
    save: string;
    cancel: string;
    choose: string;
    choose_file: string;
    edit: string;
    import: string;
    next: string;
    previous: string;
  };
  languages: { [key: string]: string };
}

export type I18nKey =
  | `menu.${keyof I18nTranslations['menu']}`
  | `labels.${keyof I18nTranslations['labels']}`
  | `headers.${keyof I18nTranslations['headers']}`
  | `buttons.${keyof I18nTranslations['buttons']}`
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
