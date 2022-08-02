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

import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { translation } from './translations';

const translations = translation(
  'fr',
  {
    menu: {
      accelerator_configuration: 'Configuration Accelerator',
      properties: 'Propriétés',
      graphical_editor: 'Éditeur graphique',
      code_editor: 'Éditeur de code',
      wizard: 'Assistant',
    },
    headers: {
      add_dictionary_field: 'Ajouter {{value}}',
      configure_credentials: 'Configure Credentials',
      import_configuration: 'Importer la configuration',
      choose_codecommit_file: 'Choisissez le fichier CodeCommit',
      export_configuration: 'Exporter la configuration',
      import_codecommit: 'CodeCommit',
      import_file: 'Fichier',
    },
    buttons: {
      add: 'Ajouter {{title}}',
      cancel: 'Annuler',
      remove: 'Supprimer {{title}}',
      save: 'Sauvegarder',
      choose: 'Choisissez',
      export: 'Exporter',
      choose_file: 'Choisissez le fichier',
      edit: 'Modifier',
      import: 'Importer',
      next: 'Next', // TODO
      previous: 'Previous', // TODO,
      save_changes: 'Save Changes', // TODO
    },
    labels: {
      empty: '<empty>',
      codecommit_repository: 'Nom du référentiel CodeCommit',
      codecommit_repository_description: 'Le nom du référentiel CodeCommit qui contient le fichier de configuration.',
      codecommit_branch: 'Nom de la branche CodeCommit',
      codecommit_branch_description: 'Le nom de la branche dans le référentiel CodeCommit.',
      codecommit_file: 'Fichier CodeCommit',
      codecommit_file_description: 'Le nom du fichier de configuration dans le référentiel CodeCommit.',
      export_as_file: 'Exportez la configuration comme un fichier et téléchargez-la avec votre navigateur.',
      export_introduction:
        "Vous pouvez télécharger la configuration comme un fichier ou l'enregistrer comme un fichier dans un référentiel CodeCommit.",
      configuration_is_valid: 'La configuration est valide.',
      array_element: 'Élément à l\'indice "{{index}}"',
      object_element: 'Élément à l\'indice "{{key}}"',
      required: 'Obligatoire',
      toggle_replacement: 'Activer remplacements',
      loading: 'Chargement...',
      selected_configuration_is_valid: 'Le fichier de configuration sélectionné est valide.',
      import_with_errors: 'Importation avec des erreurs',
      import_with_errors_description: "Le fichier sera importé même s'il y a des erreurs.",
      import_configuration_introduction:
        'Vous pouvez importer la configuration en téléchargeant un fichier ou en choisissant un fichier dans CodeCommit.',
      configuration_file: 'Fichier de configuration',
      configuration_file_description: 'Télécharger un fichier de configuration',
      configuration_file_constraint: 'JSON formatted file',
      choose_language: 'Choisissez la langue',
    },
    wizard: {
      steps: {
        configure_global_settings: 'Basic Settings',
        select_security_guardrails: 'Additional AWS Regions for Governance',
        select_security_services: 'Security Services',
        structure_organization: 'Organization Structure',
        structure_accounts: 'Account Structure',
        configure_network: 'Networking',
        configure_ad: 'Directory Services',
        review: 'Save and Export',
      },
      headers: {
        aws_configuration: 'Credentials',
        aws_configuration_desc: '',
        framework: 'Framework Template',
        framework_desc: '',
        basic_settings: 'Basic Settings',
        basic_settings_desc: '',
        security_notifications: 'Security Notifications',
        security_notifications_desc: '',
        security_guardrails_always_on: 'Always Enabled Regions',
        security_guardrails_always_on_desc: '',
        security_guardrails_opt_in: 'Opt-In Regions',
        security_guardrails_opt_in_desc: '',
        security_services: 'Security Service Deployment',
        security_services_desc: '',
        security_services_logging: 'Logging',
        security_services_logging_desc: '',
        cidr_pools: 'CIDR Pools',
        cidr_pools_desc: '',
        add_cidr_pool: 'Add CIDR pool',
        edit_cidr_pool: 'Edit CIDR pool',
        add_organizational_unit: 'Add organizational unit',
        edit_organizational_unit: 'Edit organizational unit',
        organizational_units: 'Organizational Units (Top level)',
        organizational_units_desc: '',
        mandatory_accounts: 'Shared Accounts',
        mandatory_accounts_desc: '',
        workload_accounts: 'Workload Accounts',
        workload_accounts_desc: '',
        add_mandatory_account: 'Add shared account',
        add_workload_account: 'Add workload account',
        edit_mandatory_account: 'Edit shared account',
        edit_workload_account: 'Edit workload account',
        vpcs: 'VPCs',
        vpcs_desc: '',
        add_vpc: 'Add VPC',
        edit_vpc: 'Edit VPC',
        mads: 'Managed active directory',
        mads_desc: '',
        edit_mad: 'Edit managed active directory',
        zones: 'Route53 zones',
        zones_desc: '',
        edit_zone: 'Edit Route53 zone',
      },
      labels: {
        alert_success_file: 'Successfully uploaded configuration file: {{filename}}',
        credentials_not_set: 'Please enter credentials.',
        credentials_valid: 'The provided credentials appear valid.',
        credentials_not_valid: 'The provided credentials are NOT valid.',
        ct_enabled_not_authenticated:
          'Credentials NOT provided, validation bypassed. When installing with Control Tower, the Accelerator Home region MUST match the Control Tower home region.  Additionally, Control Tower must be pre-installed before starting the Accelerator installation. At this time, it is not possible to switch between installation types after installation.',
        ct_disabled_not_authenticated:
          'Credentials NOT provided, validation bypassed. If Control Tower is installed, this option MUST be set to Control Tower. While a standalone installation is supported, AWS generally recommends installing the Accelerator on top of AWS Control Tower. At this time, it is not possible to switch between installation types after installation.',
        ct_detected_and_enabled: 'AWS Control Tower installation detected. Installing using Control Tower as the base.',
        ct_detected_and_disabled:
          'AWS Control Tower installation detected. A standalone deployment of the Accelerator is NOT supported.',
        ct_not_detected_and_enabled:
          'An AWS Control Tower installation was NOT detected and you have selected to leverage Control Tower as a base ' +
          'which is the recommended installation type. Control Tower must be installed before starting the ' +
          'Accelerator installation. To install without Control Tower, please change to a Standalone installation.',
        ct_not_detected_and_disabled:
          'Standalone installation selected. While supported, AWS generally recommends installing the Accelerator ' +
          'on top of AWS Control Tower (which requires installing AWS Control Tower before starting the Accelerator installation).',
        security_notifications_text:
          'The Accelerator provides the ability to send notifications for security findings and alerts.  These    notifications' +
          'can be classified into three priorities. Please provide an email address for each notification priority:',
        security_notifications_email_not_unique: 'These email addresses do not need to be unique.',
        security_guardrails_always_on_text:
          'The selected framework recommends deploying security guardrails in the following AWS regions.',
        security_guardrails_opt_in_text:
          'The selected framework recommends deploying security guardrails in the following AWS regions.',
        security_services_text: 'The selected framework recommends enabling the following security services.',
        security_services_logging_text: 'The selected framework recommends enabling the following security services.',
        cidr_pools_use_graphical_editor:
          'If you want to prescriptively assign your own CIDRs, please use the Advanced editor after running the wizard mode.',
        ou_key: 'OU Key',
        ou_name: 'OU Name',
        ou_default_per_account_budget: 'Default budget (per account)',
        ou_default_per_account_email: 'Budget alert email address',
        ou_name_email_change_text:
          'Account names, organizational units and email address are very hard to change after initial installation.',
        ou_email_uniqueness_text: 'Budget alert email addresses do not need to be unique.',
        account_key: 'Account Key',
        account_budget_amount: 'Budget',
        account_budget_email: 'Budget alert email address',
        account_budget_use_ou: 'Use OU budget settings',
        account_name_email_change_text: '$t(wizard.labels.ou_name_email_change_text)',
        account_email_uniqueness_text:
          'Account email addresses must each be unique and never before used to open an AWS account. Budget alert email addresses do not need to be unique.',
        account_existing_account_text:
          'To leverage an existing AWS account requires specifying an identical account name and email address to the existing account name &mdash; this is extremely important when installing on top of Control Tower.',
        vpcs_use_graphical_editor: '$t(wizard.labels.cidr_pools_use_graphical_editor)',
        zone_account: 'Account',
        zone_vpc_name: 'VPC name',
        zone_central_vpc: 'Central VPC',
        zone_has_zones: 'Has Zones',
        zone_has_resolvers: 'Has Resolvers',
      },
      fields: {
        aws_credentials: 'Please provide credentials for the AWS Organizations management account',
        aws_credentials_desc: '',
        architecture_template: 'Please select a prescriptive architecture template',
        architecture_template_desc:
          'The template is used to guide the wizard and provide suggested defaults based on the selected compliance framework or country security standard.',
        installation_region: 'Installation or Home region',
        installation_region_desc: '',
        installation_type: 'Installation type',
        installation_type_desc: '',
        high_priority_email: 'High priority notification email address',
        high_priority_email_desc: '',
        medium_priority_email: 'Medium priority notification email address',
        medium_priority_email_desc: '',
        low_priority_email: 'Low priority notification email address',
        low_priority_email_desc: '',
        aws_config: 'AWS Config',
        aws_config_desc: '',
        aws_config_rules: 'Framework provided rules ({{count}} rules)',
        aws_config_remediations: 'Framework provided remediations ({{count}} remediations)',
        cwl_centralized_access: 'CloudWatch centralized access from',
        cwl_centralized_access_desc: '',
        cwl_central_security_services_account: 'Central security services account',
        cwl_central_security_services_account_desc: '',
        cwl_central_operations_account: 'Central operations account',
        cwl_central_operations_account_desc: '',
        retention_periods_for: 'Retention periods for',
        retention_periods_for_desc: '',
        vpc_flow_logs_all_vcps: 'VPC flow logs for all VPCs',
        vpc_flow_logs_all_vcps_desc: '',
        vpc_flow_logs_s3: 'S3 central logging bucket',
        vpc_flow_logs_cwl: 'CloudWatch logs',
        ssm_logs_to: 'Systems Manager Session Manager logs to',
        ssm_logs_to_desc: '',
        dns_resolver_logging_all_vpcs: 'DNS resolver logging for all VPCs',
      },
      buttons: {
        configure_aws_credentials: 'Configure credentials',
        select_configuration_file: 'Select configuration file',
        export_configure_credentials: 'Configure AWS Credentials',
      },
    },
    splash: {
      category: 'Management &amp; Governance',
      title: 'Secure Environment Accelerator',
      subtitle: 'Deploy and operate secure multi-account, multi-region environments',
      description:
        'The AWS Accelerator is a tool designed to help deploy and operate secure multi-account, multi-region' +
        'AWS environments on an ongoing basis. The power of the solution is the configuration file that drives' +
        'the architecture deployed by the tool. This enables extensive flexibility and for the completely' +
        'automated deployment of a customized architecture within AWS without changing a single line of code.',
      create_configuration: 'Create configuration',
      next_step: 'Next step',
    },
    languages: {
      en: 'English',
      fr: 'Français',
    },
  },
  {
    currency(value: number, currency: string = 'USD'): string {
      // TODO Cache NumberFormats
      return new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency,
      }).format(value);
    },
  },
);

const translate = translations.add.bind(translations);

translate(t.cidr, {
  title: 'CIDR',
});

translate(c.asn, {
  title: 'ASN',
  errorMessage: 'La valeur doit être comprise entre 0 et 65,535.',
});

translate(c.ReplacementObject, {
  title: 'Replacement Object',
});

translate(c.ReplacementsConfig, {
  title: 'Replacements',
});

translate(c.ReplacementObjectValue, {
  title: 'Replacement',
});

translate(c.ReplacementString, {
  title: 'Replacement String',
});

translate(c.ReplacementStringArray, {
  title: 'Replacement String List',
});

translate(c.CidrConfigType, {
  title: 'CIDR Config',
  fields: {
    value: {
      title: '',
      description: '',
    },
    pool: {
      title: '',
      description: '',
    },
    size: {
      title: '',
      description: '',
    },
  },
});

translate(c.MandatoryAccountType, {
  title: '',
  description: '',
  enumLabels: {
    master: 'Master',
    'central-security': 'Central Security',
    'central-log': 'Central Log',
    'central-operations': 'Central Operations',
  },
});

translate(c.ConfigRuleType, {
  title: '',
  description: '',
  enumLabels: {
    managed: 'Managed',
    custom: 'Custom',
  },
});

translate(c.VirtualPrivateGatewayConfig, {
  title: '',
  description: '',
  fields: {
    asn: {
      title: '',
      description: '',
    },
  },
});

translate(c.PeeringConnectionConfig, {
  title: '',
  description: '',
  fields: {
    source: {
      title: '',
      description: '',
    },
    'source-vpc': {
      title: '',
      description: '',
    },
    'source-subnets': {
      title: '',
      description: '',
    },
    'local-subnets': {
      title: '',
      description: '',
    },
  },
});

translate(c.NatGatewayConfig, {
  title: '',
  description: '',
  fields: {
    subnet: {
      title: '',
      description: '',
    },
  },
});

translate(c.SubnetDefinitionConfig, {
  title: '',
  description: '',
  fields: {
    az: {
      title: '',
      description: '',
    },
    cidr: {
      title: '',
      description: '',
    },
    'route-table': {
      title: '',
      description: '',
    },
    disabled: {
      title: '',
      description: '',
    },
    'outpost-arn': {
      title: '',
    },
  },
});

translate(c.SubnetSourceConfig, {
  title: '',
  description: '',
  fields: {
    account: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    subnet: {
      title: '',
      description: '',
    },
  },
});

translate(c.NaclConfigType, {
  title: '',
  description: '',
  fields: {
    rule: {
      title: '',
      description: '',
    },
    protocol: {
      title: '',
      description: '',
    },
    ports: {
      title: '',
      description: '',
    },
    'rule-action': {
      title: '',
      description: '',
    },
    egress: {
      title: '',
      description: '',
    },
    'cidr-blocks': {
      title: '',
      description: '',
    },
  },
});

translate(c.SubnetConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    'share-to-ou-accounts': {
      title: '',
      description: '',
    },
    'share-to-specific-accounts': {
      title: '',
      description: '',
    },
    definitions: {
      title: '',
      description: '',
    },
    nacls: {
      title: '',
      description: '',
    },
  },
});

translate(c.GatewayEndpointType, {
  title: '',
  description: '',
  enumLabels: {
    s3: 'S3',
    dynamodb: 'DynamoDB',
  },
});

translate(c.PcxRouteConfigType, {
  title: '',
  description: '',
  fields: {
    account: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    subnet: {
      title: '',
      description: '',
    },
  },
});

translate(c.RouteConfig, {
  title: '',
  description: '',
  fields: {
    destination: {
      title: '',
      description: '',
    },
    target: {
      title: '',
      description: '',
    },
    name: {
      title: '',
      description: '',
    },
    az: {
      title: '',
      description: '',
    },
    port: {
      title: '',
      description: '',
    },
    'target-id': {
      title: '',
    },
    type: {
      title: '',
    },
  },
});

translate(c.RouteTableConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    routes: {
      title: '',
      description: '',
    },
  },
});

translate(c.TransitGatewayAttachOption, {
  title: '',
  description: '',
});

translate(c.TransitGatewayAssociationType, {
  title: '',
  description: '',
  enumLabels: {
    ATTACH: 'Attach',
    VPN: 'VPN',
  },
});

translate(c.TransitGatewayAttachConfigType, {
  title: '',
  description: '',
  fields: {
    'associate-to-tgw': {
      title: '',
      description: '',
    },
    account: {
      title: '',
      description: '',
    },
    'associate-type': {
      title: '',
      description: '',
    },
    'tgw-rt-associate': {
      title: '',
      description: '',
    },
    'tgw-rt-propagate': {
      title: '',
      description: '',
    },
    'blackhole-route': {
      title: '',
      description: '',
    },
    'attach-subnets': {
      title: '',
      description: '',
    },
    options: {
      title: '',
      description: '',
    },
  },
});

translate(c.TransitGatewayRouteConfigType, {
  title: '',
  description: '',
  fields: {
    destination: {
      title: '',
      description: '',
    },
    'target-tgw': {
      title: '',
      description: '',
    },
    'target-vpc': {
      title: '',
      description: '',
    },
    'target-vpn': {
      title: '',
      description: '',
    },
    'blackhole-route': {
      title: '',
      description: '',
    },
    'target-account': {
      title: '',
      description: '',
    },
  },
});

translate(c.TransitGatewayRouteTablesConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    routes: {
      title: '',
      description: '',
    },
  },
});

translate(c.TransitGatewayAttachDeploymentConfigType, {
  title: '',
  description: '',
  fields: {
    'associate-to-tgw': {
      title: '',
      description: '',
    },
    account: {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    'tgw-rt-associate-local': {
      title: '',
      description: '',
    },
    'tgw-rt-associate-remote': {
      title: '',
      description: '',
    },
  },
});

translate(c.InterfaceEndpointName, {
  title: '',
  description: '',
});

translate(c.InterfaceEndpointConfig, {
  title: '',
  description: '',
  fields: {
    subnet: {
      title: '',
      description: '',
    },
    endpoints: {
      title: '',
      description: '',
    },
    'allowed-cidrs': {
      title: '',
      description: '',
    },
  },
});

translate(c.ResolversConfigType, {
  title: '',
  description: '',
  fields: {
    subnet: {
      title: '',
      description: '',
    },
    outbound: {
      title: '',
      description: '',
    },
    inbound: {
      title: '',
      description: '',
    },
  },
});

translate(c.OnPremZoneConfigType, {
  title: '',
  description: '',
  fields: {
    zone: {
      title: '',
      description: '',
    },
    'outbound-ips': {
      title: '',
      description: '',
    },
  },
});

translate(c.SecurityGroupSourceConfig, {
  title: '',
  description: '',
  fields: {
    'security-group': {
      title: '',
      description: '',
    },
  },
});

translate(c.SecurityGroupRuleConfigType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: '',
    },
    'tcp-ports': {
      title: '',
      description: '',
    },
    'udp-ports': {
      title: '',
      description: '',
    },
    port: {
      title: '',
      description: '',
    },
    description: {
      title: '',
      description: '',
    },
    toPort: {
      title: '',
      description: '',
    },
    fromPort: {
      title: '',
      description: '',
    },
    source: {
      title: '',
      description: '',
    },
  },
});

translate(c.SecurityGroupConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    'inbound-rules': {
      title: '',
      description: '',
    },
    'outbound-rules': {
      title: '',
      description: '',
    },
  },
});

translate(c.ZoneNamesConfigType, {
  title: '',
  description: '',
  fields: {
    public: {
      title: '',
      description: '',
    },
    private: {
      title: '',
      description: '',
    },
  },
});

translate(c.FlowLogsDestinationTypes, {
  title: '',
  description: '',
  enumLabels: {
    S3: 'S3',
    CWL: 'CloudWatch',
    BOTH: 'Both',
    NONE: 'None',
  },
});

translate(c.VpcConfigType, {
  title: '',
  description: '',
  fields: {
    deploy: {
      title: '',
      description:
        '"local" if being configured inside an account or "shared-network" if being configured inside an OU.',
    },
    name: {
      title: '',
      description: 'The name of the VPC that will be deployed inside the account.',
    },
    description: {
      title: 'Description',
      description: '',
    },
    region: {
      title: '',
      description: 'Region for the VPC.',
    },
    cidr: {
      title: 'CIDR',
      description: 'CIDR range for the VPC.',
    },
    'cidr-src': {
      title: '',
      description: '',
    },
    'opt-in': {
      title: '',
      description: '',
    },
    'dedicated-tenancy': {
      title: '',
      description: '',
    },
    'use-central-endpoints': {
      title: '',
      description: 'Use centralized endpoint defined in the shared network account.',
    },
    'dns-resolver-logging': {
      title: '',
      description: '',
    },
    'flow-logs': {
      title: '',
      description: '',
    },
    'log-retention': {
      title: '',
      description: '',
    },
    igw: {
      title: 'Internet Gateway',
      description: 'Create an Internet Gateway.',
    },
    vgw: {
      title: 'Virtual Gateway',
      description: 'Create a Virtual Gateway.',
    },
    pcx: {
      title: 'Peering Connection',
      description: 'Create a peering connection.',
    },
    nfw: {
      title: 'AWS Network Firewall',
      description: 'Create the AWS NFW',
    },
    'alb-forwarding': {
      title: 'ALB IP Forwarding',
      description: 'Enable ALB to ALB forwarding with IPv4 lookup',
    },
    natgw: {
      title: 'NAT Gateway',
      description: 'Create a NAT gateway.',
    },
    subnets: {
      title: '',
      description: 'Subnet definitions for the VPC.',
    },
    'gateway-endpoints': {
      title: '',
      description: 'Create gateway endpoints.',
    },
    'route-tables': {
      title: '',
      description: 'Route tables for the VPC.',
    },
    'tgw-attach': {
      title: '',
      description: 'Attach this VPC to a transit gateway.',
    },
    'interface-endpoints': {
      title: '',
      description:
        'Deploy interface endpoints. The reference architecture prescribes centralized endpoints in the shared network account that are then shared through the TGW. You can start by adding on initial ones or provide a complete list so that they don’t need to be created in the future. There is a cost per interface endpoint.',
    },
    resolvers: {
      title: '',
      description: '',
    },
    'on-premise-rules': {
      title: '',
      description: '',
    },
    'security-groups': {
      title: '',
      description: '',
    },
    zones: {
      title: '',
      description: '',
    },
    'central-endpoint': {
      title: '',
      description: '',
    },
    'lgw-route-table-id': {
      title: '',
    },
  },
});

translate(c.IamUserConfigType, {
  title: '',
  description: '',
  fields: {
    'user-ids': {
      title: '',
      description: '',
    },
    group: {
      title: '',
      description: '',
    },
    policies: {
      title: '',
      description: '',
    },
    'boundary-policy': {
      title: '',
      description: '',
    },
  },
});

translate(c.IamPolicyConfigType, {
  title: '',
  description: '',
  fields: {
    'policy-name': {
      title: '',
      description: '',
    },
    policy: {
      title: '',
      description: '',
    },
  },
});

translate(c.IamRoleConfigType, {
  title: '',
  description: '',
  fields: {
    role: {
      title: '',
      description: '',
    },
    type: {
      title: '',
      description: '',
    },
    policies: {
      title: '',
      description: '',
    },
    'boundary-policy': {
      title: '',
      description: '',
    },
    'source-account': {
      title: '',
      description: '',
    },
    'source-account-role': {
      title: '',
      description: '',
    },
    'trust-policy': {
      title: '',
      description: '',
    },
    'ssm-log-archive-access': {
      title: '',
      description: '',
    },
    'ssm-log-archive-write-access': {
      title: '',
      description: '',
    },
    'ssm-log-archive-read-only-access': {
      title: '',
      description: '',
    },
    'meta-data-read-only-access': {
      title: '',
      description: '',
    },
  },
});

translate(c.IamConfigType, {
  title: '',
  description: '',
  fields: {
    users: {
      title: '',
      description: '',
    },
    policies: {
      title: '',
      description: '',
    },
    roles: {
      title: '',
      description: '',
    },
  },
});

translate(c.ImportCertificateConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    type: {
      title: '',
      description: '',
    },
    'priv-key': {
      title: '',
      description: '',
    },
    cert: {
      title: '',
      description: '',
    },
    chain: {
      title: '',
      description: '',
    },
  },
});

translate(c.CertificateValidationType, {
  title: '',
  description: '',
  enumLabels: {
    DNS: 'DNS',
    EMAIL: 'Email',
  },
});

translate(c.RequestCertificateConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    type: {
      title: '',
      description: '',
    },
    domain: {
      title: '',
      description: '',
    },
    validation: {
      title: '',
      description: '',
    },
    san: {
      title: '',
      description: '',
    },
  },
});

translate(c.CertificateConfigType, {
  title: '',
  description: '',
});

translate(c.TgwDeploymentConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    asn: {
      title: '',
      description: '',
    },
    features: {
      title: '',
      description: '',
    },
    'route-tables': {
      title: '',
      description: '',
    },
    'tgw-attach': {
      title: '',
      description: '',
    },
    'tgw-routes': {
      title: '',
      description: '',
    },
  },
});

translate(c.PasswordPolicyType, {
  title: '',
  description: '',
  fields: {
    history: {
      title: '',
      description: '',
    },
    'max-age': {
      title: '',
      description: '',
    },
    'min-age': {
      title: '',
      description: '',
    },
    'min-len': {
      title: '',
      description: '',
    },
    complexity: {
      title: '',
      description: '',
    },
    reversible: {
      title: '',
      description: '',
    },
    'failed-attempts': {
      title: '',
      description: '',
    },
    'lockout-duration': {
      title: '',
      description: '',
    },
    'lockout-attempts-reset': {
      title: '',
      description: '',
    },
  },
});

translate(c.ADUserConfig, {
  title: '',
  description: '',
  fields: {
    user: {
      title: '',
      description: '',
    },
    email: {
      title: '',
      description: '',
    },
    groups: {
      title: '',
      description: '',
    },
  },
});

translate(c.MadConfigType, {
  title: '',
  description: '',
  fields: {
    description: {
      title: 'Description',
      description: '',
    },
    'dir-id': {
      title: '',
      description: '',
    },
    deploy: {
      title: '',
      description: '',
    },
    'vpc-name': {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    subnet: {
      title: '',
      description: '',
    },
    azs: {
      title: '',
      description: '',
    },
    size: {
      title: '',
      description: '',
    },
    'image-path': {
      title: '',
      description: '',
    },
    'dns-domain': {
      title: '',
      description: '',
    },
    'netbios-domain': {
      title: '',
      description: '',
    },
    'central-resolver-rule-account': {
      title: '',
      description: '',
    },
    'central-resolver-rule-vpc': {
      title: '',
      description: '',
    },
    'log-group-name': {
      title: '',
      description: '',
    },
    'share-to-account': {
      title: '',
      description: '',
    },
    restrict_srcips: {
      title: '',
      description: '',
    },
    'rdgw-instance-type': {
      title: '',
      description: '',
    },
    'rdgw-enforce-imdsv2': {
      title: '',
      description: '',
    },
    'rdgw-instance-role': {
      title: '',
      description: '',
    },
    'num-rdgw-hosts': {
      title: '',
      description: '',
    },
    'rdgw-max-instance-age': {
      title: '',
      description: '',
    },
    'min-rdgw-hosts': {
      title: '',
      description: '',
    },
    'max-rdgw-hosts': {
      title: '',
      description: '',
    },
    'password-policies': {
      title: '',
      description: '',
    },
    'ad-groups': {
      title: '',
      description: '',
    },
    'ad-per-account-groups': {
      title: '',
      description: '',
    },
    'adc-group': {
      title: '',
      description: '',
    },
    'ad-users': {
      title: '',
      description: '',
    },
    'security-groups': {
      title: '',
      description: '',
    },
    'password-secret-name': {
      title: '',
      description: '',
    },
  },
});

translate(c.RsyslogSubnetConfig, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    az: {
      title: '',
      description: '',
    },
  },
});

translate(c.RsyslogConfig, {
  title: '',
  description: '',
  fields: {
    deploy: {
      title: '',
      description: '',
    },
    'vpc-name': {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    'log-group-name': {
      title: '',
      description: '',
    },
    'security-groups': {
      title: '',
      description: '',
    },
    'app-subnets': {
      title: '',
      description: '',
    },
    'web-subnets': {
      title: '',
      description: '',
    },
    'min-rsyslog-hosts': {
      title: '',
      description: '',
    },
    'desired-rsyslog-hosts': {
      title: '',
      description: '',
    },
    'max-rsyslog-hosts': {
      title: '',
      description: '',
    },
    'ssm-image-id': {
      title: '',
      description: '',
    },
    'rsyslog-instance-type': {
      title: '',
      description: '',
    },
    'rsyslog-enforce-imdsv2': {
      title: '',
      description: '',
    },
    'rsyslog-instance-role': {
      title: '',
      description: '',
    },
    'rsyslog-root-volume-size': {
      title: '',
      description: '',
    },
    'rsyslog-max-instance-age': {
      title: '',
      description: '',
    },
    'user-data': {
      title: '',
      description: '',
    },
  },
});

translate(c.ElbTargetInstanceFirewallConfigType, {
  title: '',
  description: '',
  fields: {
    target: {
      title: '',
      description: '',
    },
    name: {
      title: '',
      description: '',
    },
    az: {
      title: '',
      description: '',
    },
  },
});

translate(c.ElbTargetConfigType, {
  title: '',
  description: '',
  fields: {
    'target-name': {
      title: '',
      description: '',
    },
    'target-type': {
      title: '',
      description: '',
    },
    protocol: {
      title: '',
      description: '',
    },
    port: {
      title: '',
      description: '',
    },
    'health-check-protocol': {
      title: '',
      description: '',
    },
    'health-check-path': {
      title: '',
      description: '',
    },
    'health-check-port': {
      title: '',
      description: '',
    },
    'lambda-filename': {
      title: '',
      description: '',
    },
    'target-instances': {
      title: '',
      description: '',
    },
    'tg-weight': {
      title: '',
      description: '',
    },
  },
});

translate(c.AlbConfigType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: '',
    },
    name: {
      title: '',
      description: '',
    },
    scheme: {
      title: '',
      description: '',
    },
    'action-type': {
      title: '',
      description: '',
    },
    'ip-type': {
      title: '',
      description: '',
    },
    listeners: {
      title: '',
      description: '',
    },
    ports: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    subnets: {
      title: '',
      description: '',
    },
    'cert-name': {
      title: '',
      description: '',
    },
    'cert-arn': {
      title: '',
      description: '',
    },
    'security-policy': {
      title: '',
      description: '',
    },
    'security-group': {
      title: '',
      description: '',
    },
    'tg-stickiness': {
      title: '',
      description: '',
    },
    'target-alarms-notify': {
      title: '',
      description: '',
    },
    'target-alarms-when': {
      title: '',
      description: '',
    },
    'target-alarms-of': {
      title: '',
      description: '',
    },
    'target-alarms-is': {
      title: '',
      description: '',
    },
    'target-alarms-Count': {
      title: '',
      description: '',
    },
    'target-alarms-for': {
      title: '',
      description: '',
    },
    'target-alarms-periods-of': {
      title: '',
      description: '',
    },
    'access-logs': {
      title: '',
      description: '',
    },
    targets: {
      title: '',
      description: '',
    },
    'apply-tags': {
      title: '',
      description: '',
    },
  },
});

translate(c.GwlbConfigType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: '',
    },
    name: {
      title: '',
      description: '',
    },
    'action-type': {
      title: '',
      description: '',
    },
    'ip-type': {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    subnets: {
      title: '',
      description: '',
    },
    targets: {
      title: '',
      description: '',
    },
    'cross-zone': {
      title: '',
      description: '',
    },
    'endpoint-subnets': {
      title: '',
      description: '',
    },
    'apply-tags': {
      title: '',
      description: '',
    },
  },
});

translate(c.AdcConfigType, {
  title: '',
  description: '',
  fields: {
    deploy: {
      title: '',
      description: '',
    },
    'vpc-name': {
      title: '',
      description: '',
    },
    subnet: {
      title: '',
      description: '',
    },
    azs: {
      title: '',
      description: '',
    },
    size: {
      title: '',
      description: '',
    },
    restrict_srcips: {
      title: '',
      description: '',
    },
    'connect-account-key': {
      title: '',
      description: '',
    },
    'connect-dir-id': {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallPortConfigPrivateIpType, {
  title: '',
  description: '',
  fields: {
    ip: {
      title: '',
      description: '',
    },
    az: {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallPortConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    subnet: {
      title: '',
      description: '',
    },
    'create-eip': {
      title: '',
      description: '',
    },
    'create-cgw': {
      title: '',
      description: '',
    },
    'private-ips': {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallEC2ConfigType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: '',
    },
    name: {
      title: '',
      description: '',
    },
    'instance-sizes': {
      title: '',
      description: '',
    },
    'image-id': {
      title: '',
      description: '',
    },
    'enforce-imdsv2': {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    'security-group': {
      title: '',
      description: '',
    },
    ports: {
      title: '',
      description: '',
    },
    license: {
      title: '',
      description: '',
    },
    config: {
      title: '',
      description: '',
    },
    'fw-instance-role': {
      title: '',
      description: '',
    },
    'fw-cgw-name': {
      title: '',
      description: '',
    },
    'fw-cgw-asn': {
      title: '',
      description: '',
    },
    'fw-cgw-routing': {
      title: '',
      description: '',
    },
    'tgw-attach': {
      title: '',
      description: '',
    },
    deploy: {
      title: '',
      description: '',
    },
    'block-device-mappings': {
      title: '',
      description: '',
    },
    'user-data': {
      title: '',
      description: '',
    },
    'apply-tags': {
      title: '',
      description: '',
    },
    bootstrap: {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallCGWConfigType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: '',
    },
    name: {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    'fw-cgw-name': {
      title: '',
      description: '',
    },
    'fw-cgw-asn': {
      title: '',
      description: '',
    },
    'fw-cgw-routing': {
      title: '',
      description: '',
    },
    'tgw-attach': {
      title: '',
      description: '',
    },
    'fw-ips': {
      title: '',
      description: '',
    },
    deploy: {
      title: '',
      description: '',
    },
    'apply-tags': {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallAutoScaleConfigType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: '',
    },
    name: {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    deploy: {
      title: '',
      description: '',
    },
    'desired-hosts': {
      title: '',
      description: '',
    },
    'fw-instance-role': {
      title: '',
      description: '',
    },
    'image-id': {
      title: '',
      description: '',
    },
    'enforce-imdsv2': {
      title: '',
      description: '',
    },
    'instance-sizes': {
      title: '',
      description: '',
    },
    'key-pair': {
      title: '',
      description: '',
    },
    'load-balancer': {
      title: '',
      description: '',
    },
    'max-hosts': {
      title: '',
      description: '',
    },
    'max-instance-age': {
      title: '',
      description: '',
    },
    'min-hosts': {
      title: '',
      description: '',
    },
    'root-volume-size': {
      title: '',
      description: '',
    },
    'security-group': {
      title: '',
      description: '',
    },
    'user-data': {
      title: '',
      description: '',
    },
    subnet: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    'block-device-mappings': {
      title: '',
      description: '',
    },
    'cpu-utilization-scale-in': {
      title: '',
      description: '',
    },
    'cpu-utilization-scale-out': {
      title: '',
      description: '',
    },
    'create-eip': {
      title: '',
      description: '',
    },
    'apply-tags': {
      title: '',
      description: '',
    },
    bootstrap: {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallManagerConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    'instance-sizes': {
      title: '',
      description: '',
    },
    'image-id': {
      title: '',
      description: '',
    },
    'enforce-imdsv2': {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    'security-group': {
      title: '',
      description: '',
    },
    subnet: {
      title: '',
      description: '',
    },
    'create-eip': {
      title: '',
      description: '',
    },
    'key-pair': {
      title: '',
      description: '',
    },
    'user-data': {
      title: '',
      description: '',
    },
    'block-device-mappings': {
      title: '',
      description: '',
    },
    'apply-tags': {
      title: '',
      description: '',
    },
    bootstrap: {
      title: '',
      description: '',
    },
    'fw-instance-role': {
      title: '',
      description: '',
    },
  },
});

translate(c.LandingZoneAccountType, {
  title: '',
  description: '',
  enumLabels: {
    primary: 'primary',
    security: 'security',
    'log-archive': 'log-archive',
    'shared-services': 'shared-services',
  },
});

translate(c.BaseLineConfigType, {
  title: '',
  description: '',
  enumLabels: {
    LANDING_ZONE: 'Landing Zone',
    ORGANIZATIONS: 'Organizations',
    CONTROL_TOWER: 'Control Tower',
  },
});

translate(c.DeploymentConfigType, {
  title: '',
  description: '',
  fields: {
    tgw: {
      title: '',
      description: '',
    },
    mad: {
      title: '',
      description: '',
    },
    rsyslog: {
      title: '',
      description: '',
    },
    adc: {
      title: '',
      description: '',
    },
    firewalls: {
      title: '',
      description: '',
    },
    'firewall-manager': {
      title: '',
      description: '',
    },
  },
});

translate(c.BudgetNotificationType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: '',
    },
    'threshold-percent': {
      title: '',
      description: '',
    },
    emails: {
      title: '',
      description: '',
    },
  },
});

translate(c.BudgetConfigType, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    period: {
      title: '',
      description: '',
    },
    amount: {
      title: '',
      description: '',
    },
    include: {
      title: '',
      description: '',
    },
    alerts: {
      title: '',
      description: '',
    },
  },
});

translate(c.LimitConfig, {
  title: '',
  description: '',
  fields: {
    value: {
      title: '',
      description: '',
    },
    'customer-confirm-inplace': {
      title: '',
      description: '',
    },
  },
});

translate(c.SsmShareAutomation, {
  title: '',
  description: '',
  fields: {
    account: {
      title: '',
      description: '',
    },
    regions: {
      title: '',
      description: '',
    },
    documents: {
      title: '',
      description: '',
    },
  },
});

translate(c.AwsConfigRules, {
  title: '',
  description: '',
  fields: {
    'excl-regions': {
      title: '',
      description: '',
    },
    rules: {
      title: '',
      description: '',
    },
    'remediate-regions': {
      title: '',
      description: '',
    },
  },
});

translate(c.AwsConfigAccountConfig, {
  title: '',
  description: '',
  fields: {
    regions: {
      title: '',
      description: '',
    },
    'excl-rules': {
      title: '',
      description: '',
    },
  },
});

translate(c.MandatoryAccountConfigType, {
  title: 'Configuration des Accounts',
  description: '',
  fields: {
    'gui-perm': {
      title: '',
      description: '',
    },
    description: {
      title: 'Description',
      description: '',
    },
    'account-name': {
      title: '',
      description: 'Name of the network account',
    },
    email: {
      title: '',
      description: 'Email address associated to the this account.',
    },
    ou: {
      title: 'Organizational Unit',
      description:
        'Organizational unit the account belongs to. Mandatory accounts typically belong to the ‘core’ organization unit.',
    },
    'ou-path': {
      title: '',
      description: '',
    },
    'share-mad-from': {
      title: '',
      description: '',
    },
    'enable-s3-public-access': {
      title: '',
      description: '',
    },
    iam: {
      title: '',
      description: 'IAM configuration for this account like users, roles and policies.',
    },
    limits: {
      title: '',
      description: 'Limit increase requests for the account.',
    },
    certificates: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    deployments: {
      title: '',
      description: '',
    },
    alb: {
      title: '',
      description: '',
    },
    's3-retention': {
      title: '',
      description: '',
    },
    budget: {
      title: '',
      description: '',
    },
    'account-warming-required': {
      title: '',
      description: '',
    },
    'cwl-retention': {
      title: '',
      description: '',
    },
    deleted: {
      title: '',
      description: '',
    },
    'src-filename': {
      title: '',
      description: '',
    },
    'exclude-ou-albs': {
      title: '',
      description: '',
    },
    'keep-default-vpc-regions': {
      title: '',
      description: '',
    },
    'populate-all-elbs-in-param-store': {
      title: '',
      description: '',
    },
    'ssm-automation': {
      title: '',
      description: '',
    },
    'ssm-inventory-collection': {
      title: '',
      description: '',
    },
    'aws-config': {
      title: '',
      description: '',
    },
    scps: {
      title: '',
      description: '',
    },
    'opt-in-vpcs': {
      title: '',
      description: '',
    },
    'key-pairs': {
      title: '',
      description: '',
    },
    secrets: {
      title: '',
      description: '',
    },
  },
});

translate(c.AccountsConfigType, {
  title: 'Configuration des Accounts',
  description: '',
});

translate(c.OrganizationalUnitConfigType, {
  title: '',
  description: '',
  fields: {
    'gui-perm': {
      title: '',
      description: '',
    },
    description: {
      title: 'Description',
      description: '',
    },
    type: {
      title: '',
      description: '',
    },
    scps: {
      title: '',
      description: '',
    },
    'share-mad-from': {
      title: '',
      description: '',
    },
    certificates: {
      title: '',
      description: '',
    },
    iam: {
      title: '',
      description: '',
    },
    alb: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: '',
    },
    'default-budgets': {
      title: '',
      description: '',
    },
    'ssm-automation': {
      title: '',
      description: '',
    },
    'ssm-inventory-collection': {
      title: '',
      description: '',
    },
    'aws-config': {
      title: '',
      description: '',
    },
  },
});

translate(c.OrganizationalUnitsConfigType, {
  title: '',
  description: '',
});

translate(c.GlobalOptionsZonesConfigType, {
  title: '',
  description: '',
  fields: {
    account: {
      title: '',
      description: '',
    },
    'resolver-vpc': {
      title: '',
      description: '',
    },
    names: {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
  },
});

translate(c.CostAndUsageReportConfigType, {
  title: 'Cost and Usage Report',
  description: '',
  fields: {
    'additional-schema-elements': {
      title: '',
      description: '',
    },
    compression: {
      title: '',
      description: '',
    },
    format: {
      title: '',
      description: '',
    },
    'report-name': {
      title: '',
      description: '',
    },
    's3-prefix': {
      title: '',
      description: '',
    },
    'time-unit': {
      title: '',
      description: '',
    },
    'additional-artifacts': {
      title: '',
      description: '',
    },
    'refresh-closed-reports': {
      title: '',
      description: '',
    },
    'report-versioning': {
      title: '',
      description: '',
    },
  },
});

translate(c.ReportsConfigType, {
  title: 'Reports Configuration',
  description: 'Cost and usage reports to be collected.',
  fields: {
    'cost-and-usage-report': {
      title: '',
      description: '',
    },
  },
});

translate(c.SecurityHubFrameworksConfigType, {
  title: '',
  description: '',
  fields: {
    standards: {
      title: '',
      description: '',
    },
  },
});

translate(c.IamAccountPasswordPolicyType, {
  title: '',
  description: '',
  fields: {
    'allow-users-to-change-password': {
      title: '',
      description: '',
    },
    'hard-expiry': {
      title: '',
      description: '',
    },
    'require-uppercase-characters': {
      title: '',
      description: '',
    },
    'require-lowercase-characters': {
      title: '',
      description: '',
    },
    'require-symbols': {
      title: '',
      description: '',
    },
    'require-numbers': {
      title: '',
      description: '',
    },
    'minimum-password-length': {
      title: '',
      description: '',
    },
    'password-reuse-prevention': {
      title: '',
      description: '',
    },
    'max-password-age': {
      title: '',
      description: '',
    },
  },
});

translate(c.CwlExclusions, {
  title: '',
  description: '',
  fields: {
    account: {
      title: '',
      description: '',
    },
    exclusions: {
      title: '',
      description: '',
    },
  },
});

translate(c.S3LogPartitionType, {
  title: '',
  description: '',
  fields: {
    logGroupPattern: {
      title: '',
      description: '',
    },
    s3Prefix: {
      title: '',
      description: '',
    },
  },
});

translate(c.CentralServicesConfigType, {
  title: '',
  description: '',
  fields: {
    account: {
      title: '',
      description: '',
    },
    region: {
      title: '',
      description: '',
    },
    'security-hub': {
      title: '',
      description: '',
    },
    'security-hub-excl-regions': {
      title: '',
      description: '',
    },
    guardduty: {
      title: '',
      description: '',
    },
    'guardduty-excl-regions': {
      title: '',
      description: '',
    },
    'guardduty-s3': {
      title: '',
      description: '',
    },
    'guardduty-s3-excl-regions': {
      title: '',
      description: '',
    },
    'access-analyzer': {
      title: '',
      description: '',
    },
    cwl: {
      title: '',
      description: '',
    },
    'cwl-access-level': {
      title: '',
      description: '',
    },
    'cwl-glbl-exclusions': {
      title: '',
      description: '',
    },
    'ssm-to-s3': {
      title: '',
      description: '',
    },
    'ssm-to-cwl': {
      title: '',
      description: '',
    },
    'cwl-exclusions': {
      title: '',
      description: '',
    },
    'kinesis-stream-shard-count': {
      title: '',
      description: '',
    },
    macie: {
      title: '',
      description: '',
    },
    'macie-excl-regions': {
      title: '',
      description: '',
    },
    'macie-frequency': {
      title: '',
      description: '',
    },
    'config-excl-regions': {
      title: '',
      description: '',
    },
    'config-aggr-excl-regions': {
      title: '',
      description: '',
    },
    'sns-excl-regions': {
      title: '',
      description: '',
    },
    'sns-subscription-emails': {
      title: '',
      description: '',
    },
    's3-retention': {
      title: '',
      description: '',
    },
    'add-sns-topics': {
      title: '',
      description: '',
    },
    'fw-mgr-alert-level': {
      title: '',
      description: '',
    },
    'macie-sensitive-sh': {
      title: '',
      description: '',
    },
    'security-hub-findings-sns': {
      title: '',
      description: '',
    },
    'config-aggr': {
      title: '',
      description: '',
    },
    'dynamic-s3-log-partitioning': {
      title: '',
      description: '',
    },
  },
});

translate(c.ScpsConfigType, {
  title: 'Service Control Policies',
  description: "Name of the different SCPs that will be used. This list maps each SPC's JSON with a referentiable name",
  fields: {
    name: {
      title: '',
      description: '',
    },
    description: {
      title: '',
      description: '',
    },
    policy: {
      title: '',
      description: '',
    },
  },
});

translate(c.FlowLogsFilterTypes, {
  title: '',
  description: '',
  enumLabels: {
    ACCEPT: 'Accept',
    REJECT: 'Reject',
    ALL: 'All',
  },
});

translate(c.FlowLogsIntervalTypes, {
  title: '',
  description: '',
});

translate(c.VpcFlowLogsConfigType, {
  title: '',
  description: '',
  fields: {
    filter: {
      title: '',
      description: '',
    },
    interval: {
      title: '',
      description: '',
    },
    'default-format': {
      title: '',
      description: '',
    },
    'custom-fields': {
      title: '',
      description: '',
    },
  },
});

translate(c.AdditionalCwlRegionType, {
  title: '',
  description: '',
  fields: {
    'kinesis-stream-shard-count': {
      title: '',
      description: '',
    },
  },
});

translate(c.CloudWatchMetricFiltersConfigType, {
  title: '',
  description: '',
  fields: {
    'filter-name': {
      title: '',
      description: '',
    },
    accounts: {
      title: '',
      description: '',
    },
    regions: {
      title: '',
      description: '',
    },
    'loggroup-name': {
      title: '',
      description: '',
    },
    'filter-pattern': {
      title: '',
      description: '',
    },
    'metric-namespace': {
      title: '',
      description: '',
    },
    'metric-name': {
      title: '',
      description: '',
    },
    'metric-value': {
      title: '',
      description: '',
    },
    'default-value': {
      title: '',
      description: '',
    },
  },
});

translate(c.CloudWatchAlarmDefinitionConfigType, {
  title: '',
  description: '',
  fields: {
    accounts: {
      title: '',
      description: '',
    },
    regions: {
      title: '',
      description: '',
    },
    namespace: {
      title: '',
      description: '',
    },
    statistic: {
      title: '',
      description: '',
    },
    period: {
      title: '',
      description: '',
    },
    'threshold-type': {
      title: '',
      description: '',
    },
    'comparison-operator': {
      title: '',
      description: '',
    },
    threshold: {
      title: '',
      description: '',
    },
    'evaluation-periods': {
      title: '',
      description: '',
    },
    'treat-missing-data': {
      title: '',
      description: '',
    },
    'alarm-name': {
      title: '',
      description: '',
    },
    'metric-name': {
      title: '',
      description: '',
    },
    'sns-alert-level': {
      title: '',
      description: '',
    },
    'alarm-description': {
      title: '',
      description: '',
    },
    'in-org-mgmt-use-lcl-sns': {
      title: '',
      description: '',
    },
  },
});

translate(c.CloudWatchAlarmsConfigType, {
  title: '',
  description: '',
  fields: {
    'default-accounts': {
      title: '',
      description: '',
    },
    'default-regions': {
      title: '',
      description: '',
    },
    'default-namespace': {
      title: '',
      description: '',
    },
    'default-statistic': {
      title: '',
      description: '',
    },
    'default-period': {
      title: '',
      description: '',
    },
    'default-threshold-type': {
      title: '',
      description: '',
    },
    'default-comparison-operator': {
      title: '',
      description: '',
    },
    'default-threshold': {
      title: '',
      description: '',
    },
    'default-evaluation-periods': {
      title: '',
      description: '',
    },
    'default-treat-missing-data': {
      title: '',
      description: '',
    },
    'default-in-org-mgmt-use-lcl-sns': {
      title: '',
      description: '',
    },
    definitions: {
      title: '',
      description: '',
    },
  },
});

translate(c.SsmDocument, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    description: {
      title: '',
      description: '',
    },
    template: {
      title: '',
      description: '',
    },
  },
});
translate(c.SsmAutomation, {
  title: '',
  description: '',
  fields: {
    accounts: {
      title: '',
      description: '',
    },
    regions: {
      title: '',
      description: '',
    },
    documents: {
      title: '',
      description: '',
    },
  },
});

translate(c.AwsConfigRuleDefaults, {
  title: '',
  description: '',
  fields: {
    remediation: {
      title: '',
      description: '',
    },
    'remediation-attempts': {
      title: '',
      description: '',
    },
    'remediation-retry-seconds': {
      title: '',
      description: '',
    },
    'remediation-concurrency': {
      title: '',
      description: '',
    },
  },
});

translate(c.AwsConfigRule, {
  title: '',
  description: '',
  fields: {
    name: {
      title: '',
      description: '',
    },
    remediation: {
      title: '',
      description: '',
    },
    'remediation-attempts': {
      title: '',
      description: '',
    },
    'remediation-retry-seconds': {
      title: '',
      description: '',
    },
    'remediation-concurrency': {
      title: '',
      description: '',
    },
    'remediation-action': {
      title: '',
      description: '',
    },
    'remediation-params': {
      title: '',
      description: '',
    },
    parameters: {
      title: '',
      description: '',
    },
    type: {
      title: '',
      description: '',
    },
    'max-frequency': {
      title: '',
      description: '',
    },
    'resource-types': {
      title: '',
      description: '',
    },
    runtime: {
      title: '',
      description: '',
    },
    'runtime-path': {
      title: '',
      description: '',
    },
  },
});

translate(c.AwsConfig, {
  title: '',
  description: '',
  fields: {
    defaults: {
      title: '',
      description: '',
    },
    rules: {
      title: '',
      description: '',
    },
  },
});

translate(c.GlobalOptionsConfigType, {
  title: 'Options Globals',
  description: '',
  fields: {
    'ct-baseline': {
      title: 'Control Tower Baseline',
      description: 'For future integration with Control Tower.',
    },
    'meta-data-collection': {
      title: 'Metadata Collection',
      description: 'Metadata collection service that stores information about ASEA in the management account',
    },
    'default-s3-retention': {
      title: 'Lifecycle policy for S3',
      description:
        'Every individual account retains logs for a period of X (defined in this parameter) days before rotating those logs. Logs are still retained afterwards in the log archive account.',
    },
    'central-bucket': {
      title: 'Central Bucket',
      description:
        'Bucket to store this configuration file in you account as well as licenses, certificates and other artifacts needed for installations and upgrades.',
    },
    reports: {
      title: '',
      description: '',
    },
    'security-hub-frameworks': {
      title: '',
      description: 'Security Hub provides controls for the frameworks defined in this parameter.',
    },
    'central-security-services': {
      title: '',
      description: 'Security services that will be deployed and the sub-account were they are configured.',
    },
    'central-operations-services': {
      title: '',
      description: 'Operations services that will be deployed and the sub-account were they are configured.',
    },
    'central-log-services': {
      title: '',
      description: 'Logging services that will be deployed and the sub-account were they are configured.',
    },
    'aws-org-management': {
      title: 'AWS Organizational Management Account',
      description:
        "The name of the Organizational Management account were the solution will be installed. This account's parameters are defined in another section of the file.",
    },
    scps: {
      title: '',
      description: '',
    },
    'organization-admin-role': {
      title: 'Organization Admin Role',
      description:
        'Role that will be created in every sub-account so that the administrator can role-switch into them with admin right.',
    },
    'supported-regions': {
      title: 'Supported Regions',
      description: 'Regions that will be monitored by the security services configured.',
    },
    'keep-default-vpc-regions': {
      title: '',
      description:
        "ASEA deletes default VPCs in every region, this specifies regions where ASEA won't delete the default VPCs.",
    },
    'iam-password-policies': {
      title: '',
      description: 'Policies for IAM user passwords.',
    },
    'default-cwl-retention': {
      title: 'Default CloudWatch Logs retention',
      description:
        'By default in AWS, logs are kept indefinitely and never expire. You can define a new default retention here.',
    },
    'ignored-ous': {
      title: '',
      description:
        'If you have existing sub-accounts, place them inside OUs and define those in this parameter so that the tool can ignore them and not apply any controls to them. If not you will be obliged to defined them in the config file.',
    },
    'install-cloudformation-master-role': {
      title: '',
      description: '',
    },
    'workloadaccounts-prefix': {
      title: '',
      description: '',
    },
    'workloadaccounts-suffix': {
      title: '',
      description: '',
    },
    'workloadaccounts-param-filename': {
      title: 'Workload Accounts Parameter Filename',
      description:
        'This would allow you to define workload accounts in a separate configuration file. As you number of workload accounts grows it would make sense to keep them in a separate file.',
    },
    'vpc-flow-logs': {
      title: '',
      description:
        'Allows you to gather additional custom fields than the default format. New fields are added here as they are added to the service.',
    },
    'additional-cwl-regions': {
      title: '',
      description: 'Display metrics from different regions.',
    },
    'additional-global-output-regions': {
      title: '',
      description: '',
    },
    cloudwatch: {
      title: 'CloudWatch',
      description: 'Section to define CloudWatch metrics and alarms.',
    },
    'ssm-automation': {
      title: 'SSM Automation',
      description:
        'Define SSM automation documents here. This can later be invoked from config rules to apply corrective actions to broken rules.',
    },
    'aws-config': {
      title: 'AWS Config',
      description:
        'Custom and pre-defined rules to be used with AWS Config service. Remediation actions defined in ssm automation can be invoked from each rule.',
    },
    'default-ssm-documents': {
      title: '',
      description: '',
    },
    'cidr-pools': {
      title: '',
      description: '',
    },
    'control-tower-supported-regions': {
      title: '',
      description: '',
    },
    'endpoint-port-overrides': {
      title: '',
      description: '',
    },
    'separate-s3-dp-org-trail': {
      title: '',
      description: '',
    },
  },
});

translate(c.AcceleratorConfigType, {
  title: 'Configuration',
  description: '',
  fields: {
    replacements: {
      title: '',
      description: '',
    },
    'global-options': {
      title: '',
      description: '',
    },
    'mandatory-account-configs': {
      title: 'Required Account Configuration',
      description:
        'Landing zones have a concept of core accounts that provide functions that span across many AWS accounts. For example, shared services, networking, security, logging etc. This section allows you to define your core accounts and customize their configuration. Currently the Accelerator supports one management, central security, logging, operations (aka shared services), internal networking and perimeter networking core accounts.',
    },
    'workload-account-configs': {
      title: 'Workload Account Configuration',
      description: '',
    },
    'organizational-units': {
      title: '',
      description: '',
    },
  },
});

export default translations;
