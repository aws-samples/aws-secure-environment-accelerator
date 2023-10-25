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

import * as t from '@aws-accelerator/common-types';

/**
 * Translation definition that is used as base for all other translations.
 */
export interface FieldTranslations {
  title?: string;
  description?: string;
  url?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends t.SizedType<any, any>
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
    save_changes: string;
  };
  wizard: {
    steps: {
      configure_global_settings: string;
      select_security_guardrails: string;
      select_security_services: string;
      structure_organization: string;
      structure_accounts: string;
      configure_network: string;
      configure_ad: string;
      review: string;
    };
    headers: {
      aws_configuration: string;
      aws_configuration_desc: string;
      framework: string;
      framework_desc: string;
      basic_settings: string;
      basic_settings_desc: string;
      security_notifications: string;
      security_notifications_desc: string;
      security_guardrails_always_on: string;
      security_guardrails_always_on_desc: string;
      security_guardrails_opt_in: string;
      security_guardrails_opt_in_desc: string;
      security_services: string;
      security_services_desc: string;
      security_services_logging: string;
      security_services_logging_desc: string;
      cidr_pools: string;
      cidr_pools_desc: string;
      add_cidr_pool: string;
      edit_cidr_pool: string;
      add_organizational_unit: string;
      edit_organizational_unit: string;
      organizational_units: string;
      organizational_units_desc: string;
      mandatory_accounts: string;
      mandatory_accounts_desc: string;
      workload_accounts: string;
      workload_accounts_desc: string;
      add_mandatory_account: string;
      add_workload_account: string;
      edit_mandatory_account: string;
      edit_workload_account: string;
      vpcs: string;
      vpcs_desc: string;
      add_vpc: string;
      edit_vpc: string;
      mads: string;
      mads_desc: string;
      edit_mad: string;
      zones: string;
      zones_desc: string;
      edit_zone: string;
    };
    labels: {
      alert_success_file: string;
      credentials_not_set: string;
      credentials_valid: string;
      credentials_not_valid: string;
      ct_enabled_not_authenticated: string;
      ct_disabled_not_authenticated: string;
      ct_detected_and_enabled: string;
      ct_detected_and_disabled: string;
      ct_not_detected_and_enabled: string;
      ct_not_detected_and_disabled: string;
      security_notifications_text: string;
      security_notifications_email_not_unique: string;
      security_guardrails_always_on_text: string;
      security_guardrails_opt_in_text: string;
      security_services_text: string;
      security_services_logging_text: string;
      cidr_pools_use_graphical_editor: string;
      ou_key: string;
      ou_name: string;
      ou_default_per_account_budget: string;
      ou_default_per_account_email: string;
      ou_name_email_change_text: string;
      ou_email_uniqueness_text: string;
      account_key: string;
      account_budget_use_ou: string;
      account_budget_amount: string;
      account_budget_email: string;
      account_name_email_change_text: string;
      account_email_uniqueness_text: string;
      account_existing_account_text: string;
      vpcs_use_graphical_editor: string;
      zone_account: string;
      zone_vpc_name: string;
      zone_central_vpc: string;
      zone_has_zones: string;
      zone_has_resolvers: string;
    };
    fields: {
      aws_credentials: string;
      aws_credentials_desc: string;
      architecture_template: string;
      architecture_template_desc: string;
      installation_region: string;
      installation_region_desc: string;
      installation_type: string;
      installation_type_desc: string;
      high_priority_email: string;
      high_priority_email_desc: string;
      medium_priority_email: string;
      medium_priority_email_desc: string;
      low_priority_email: string;
      low_priority_email_desc: string;
      aws_config: string;
      aws_config_desc: string;
      aws_config_rules: string;
      aws_config_remediations: string;
      cwl_centralized_access: string;
      cwl_centralized_access_desc: string;
      cwl_central_security_services_account: string;
      cwl_central_security_services_account_desc: string;
      cwl_central_operations_account: string;
      cwl_central_operations_account_desc: string;
      retention_periods_for: string;
      retention_periods_for_desc: string;
      vpc_flow_logs_all_vcps: string;
      vpc_flow_logs_all_vcps_desc: string;
      vpc_flow_logs_s3: string;
      vpc_flow_logs_cwl: string;
      ssm_logs_to: string;
      ssm_logs_to_desc: string;
      dns_resolver_logging_all_vpcs: string;
    };
    buttons: {
      configure_aws_credentials: string;
      select_configuration_file: string;
      export_configure_credentials: string;
    };
  };
  splash: {
    category: string;
    title: string;
    subtitle: string;
    description: string;
    create_configuration: string;
    next_step: string;
  };
  languages: { [key: string]: string };
}

export type I18nKey =
  | `menu.${keyof I18nTranslations['menu']}`
  | `labels.${keyof I18nTranslations['labels']}`
  | `headers.${keyof I18nTranslations['headers']}`
  | `buttons.${keyof I18nTranslations['buttons']}`
  | `wizard.${keyof I18nTranslations['wizard']}`
  | `wizard.steps.${keyof I18nTranslations['wizard']['steps']}`
  | `wizard.headers.${keyof I18nTranslations['wizard']['headers']}`
  | `wizard.labels.${keyof I18nTranslations['wizard']['labels']}`
  | `wizard.fields.${keyof I18nTranslations['wizard']['fields']}`
  | `wizard.buttons.${keyof I18nTranslations['wizard']['buttons']}`
  | `splash.${keyof I18nTranslations['splash']}`
  | `languages.${keyof I18nTranslations['languages']}`;

/**
 * Translation interface for a specific language.
 */
export interface Translation {
  languageCode: string;
  translations: I18nTranslations;
  add<T extends t.Any>(type: T, translations: TypeTranslations<T>): this;
  tr<T extends t.Any>(type: T): TypeTranslations<T> | undefined;
  currency(value: number, currency?: string): string;
}

export interface I18nFormatters {
  currency(value: number, currency?: string): string;
}

/**
 * Function that creates a new translation for the given language code.
 */
export function translation(
  languageCode: string,
  translations: I18nTranslations,
  formatters: I18nFormatters,
): Translation {
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
    currency(value: number, currency?: string) {
      return formatters.currency(value, currency);
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isInterfaceTranslations(value: FieldTranslations): value is InterfaceTranslations<any> {
  return 'fields' in value;
}

/**
 * Copy an object and omit empty values.
 */
function copyOmitEmpty<T>(value: T): T | undefined {
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as any)
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
