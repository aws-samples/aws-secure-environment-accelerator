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
  'en',
  {
    menu: {
      accelerator_configuration: 'AWS Secure Environment Accelerator Configuration Editor',
      properties: 'Properties',
      graphical_editor: 'Advanced Editor',
      code_editor: 'Raw Code Editor',
      wizard: 'Wizard',
    },
    headers: {
      add_dictionary_field: 'Add {{value}}',
      configure_credentials: 'Configure Credentials',
      import_configuration: 'Import Configuration',
      choose_codecommit_file: 'Choose CodeCommit File',
      export_configuration: 'Export Configuration',
      import_codecommit: 'CodeCommit',
      import_file: 'File',
    },
    buttons: {
      add: 'Add {{title}}',
      cancel: 'Cancel',
      remove: 'Remove {{title}}',
      save: 'Save',
      choose: 'Choose',
      export: 'Export',
      choose_file: 'Choose file',
      edit: 'Edit',
      import: 'Import',
      next: 'Next',
      previous: 'Previous',
      save_changes: 'Save Changes',
    },
    labels: {
      empty: '<empty>',
      codecommit_repository: 'CodeCommit Repository Name',
      codecommit_repository_description: 'The name of the CodeCommit repository containing the configuration file.',
      codecommit_branch: 'CodeCommit Branch',
      codecommit_branch_description: 'The name of the branch in the CodeCommit repository.',
      codecommit_file: 'CodeCommit File Path',
      codecommit_file_description: 'The name of the configuration file in the CodeCommit repository.',
      export_as_file: 'Export the configuration as a file and download it with your browser.',
      export_introduction:
        'You can export the configuration as a downloadable file or save it directly in an AWS CodeCommit repository.',
      configuration_is_valid: 'The configuration is valid.',
      array_element: 'Element with index "{{index}}"',
      object_element: 'Element with key "{{key}}"',
      required: 'Required',
      toggle_replacement: 'Enable Replacements',
      loading: 'Loading...',
      selected_configuration_is_valid: 'The selected configuration file is valid.',
      import_with_errors: 'Import with errors',
      import_with_errors_description: 'The file will be imported even though there are errors.',
      import_configuration_introduction:
        'You can import a configuration by uploading a file or choosing a file from CodeCommit.',
      configuration_file: 'Configuration File',
      configuration_file_description: 'Upload a configuration file',
      configuration_file_constraint: 'JSON formatted file',
      choose_language: 'Choose language',
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
        framework_desc:
          'The template is used to guide the wizard and provide suggested defaults based on the selected compliance framework or country security standard.',
        basic_settings: 'Basic Settings',
        basic_settings_desc: '',
        security_notifications: 'Security Notifications',
        security_notifications_desc: '',
        security_guardrails_always_on: 'AWS Regions for governance',
        security_guardrails_always_on_desc:
          'AWS generally recommends enabling the deployment of security guardrails in all enabled regions, regardless of the regions actually being used by a customer.',
        security_guardrails_opt_in: 'Opt-In Regions requiring governance',
        security_guardrails_opt_in_desc: 'These regions are NOT supported at this time.',
        security_services: 'Security Service Deployment',
        security_services_desc: '',
        security_services_logging: 'Logging',
        security_services_logging_desc: '',
        cidr_pools: 'CIDR Pools',
        cidr_pools_desc:
          'Address pools that will be used to dynamically assign CIDR ranges to each VPC set for dynamic address assignment.',
        add_cidr_pool: 'Add CIDR pool',
        edit_cidr_pool: 'Edit CIDR pool',
        add_organizational_unit: 'Add organizational unit',
        edit_organizational_unit: 'Edit organizational unit',
        organizational_units: 'Organizational Units (Top level)',
        organizational_units_desc:
          'OUs are used to group accounts by major changes in permissions. While they often resemble the SDLC cycle, they should only reflect MAJOR shifts (QA often fits with Test, Pre-Prod within Prod, etc.)',
        mandatory_accounts: 'Shared Accounts',
        mandatory_accounts_desc:
          'These are AWS accounts (private cloud environments) which are used to provide centralized functionality across the entire organization. These typically do not change over the course of a customers AWS journey.',
        workload_accounts: 'Workload Accounts',
        workload_accounts_desc:
          'These are AWS accounts (private cloud environments) containing business workloads.  As customers grow and evolve, new workload  accounts are typically created.',
        add_mandatory_account: 'Add shared account',
        add_workload_account: 'Add workload account',
        edit_mandatory_account: 'Edit shared account',
        edit_workload_account: 'Edit workload account',
        vpcs: 'VPCs',
        vpcs_desc: 'Description13',
        add_vpc: 'Add VPC',
        edit_vpc: 'Edit VPC',
        mads: 'Managed active directory',
        mads_desc: 'Description14',
        edit_mad: 'Edit managed active directory',
        zones: 'Route53 zones',
        zones_desc: 'Description15',
        edit_zone: 'Edit Route53 zone',
      },
      labels: {
        alert_success_file: 'Successfully uploaded configuration file: {{filename}}',
        credentials_not_set: 'Please enter credentials.',
        credentials_valid: 'The provided credentials appear valid.',
        credentials_not_valid: 'The provided credentials are NOT valid.',
        ct_enabled_not_authenticated:
          'Credentials NOT provided, validation bypassed. When installing with Control Tower, the Accelerator home region MUST match the Control Tower home region.  Additionally, Control Tower must be pre-installed before starting the Accelerator installation. At this time, it is not possible to switch between installation types after installation.',
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
          'The selected framework recommends deploying security guardrails in the following selected AWS regions.',
        security_guardrails_opt_in_text:
          'The selected framework recommends deploying security guardrails in the following selected AWS regions.',
        security_services_text: 'The selected framework recommends enabling the following selected security services.',
        security_services_logging_text: 'The selected framework recommends enabling the following log settings.',
        cidr_pools_use_graphical_editor:
          'If you want to prescriptively assign your own CIDRs, please use the Advanced editor after running the wizard mode.',
        ou_key: 'OU Key',
        ou_name: 'OU Name',
        ou_default_per_account_budget: 'Default budget (per account)',
        ou_default_per_account_email: 'Budget alert email address',
        ou_name_email_change_text:
          'Account names and account email address are very hard to change after initial installation.',
        ou_email_uniqueness_text: 'Budget alert email addresses do not need to be unique.',
        account_key: 'Account Key (unique internal identifier)',
        account_budget_amount: 'Budget',
        account_budget_email: 'Budget alert email address',
        account_budget_use_ou: 'Use OU budget settings',
        account_name_email_change_text: '$t(wizard.labels.ou_name_email_change_text)',
        account_email_uniqueness_text:
          'Account email addresses must each be unique and never before used to open an AWS account. Budget alert email addresses do not need to be unique.',
        account_existing_account_text:
          'To leverage an existing AWS account requires specifying an identical account name and email address to the existing account name - this is extremely important when installing on top of Control Tower.',
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
          'Accelerator JSON config file (YAML NOT supported).  While any valid Accelerator config file can be used, the template limits and controls the wizards capabilities.',
        installation_region:
          'Installation or home region. Defaults to the region provided when suplying security credentials.',
        installation_region_desc: 'The primary or main region used to host your AWS workloads.',
        installation_type: 'Installation type',
        installation_type_desc:
          'While AWS generally recommends deploying using a Control Tower based installation type, the supplied template recommends the following installation type.',
        high_priority_email: 'High priority notification email address',
        high_priority_email_desc: '',
        medium_priority_email: 'Medium priority notification email address',
        medium_priority_email_desc: '',
        low_priority_email: 'Low priority notification email address',
        low_priority_email_desc: '',
        aws_config: 'AWS Config:',
        aws_config_desc: '',
        aws_config_rules: 'Framework provided rules ({{count}} rules)',
        aws_config_remediations: 'Framework provided remediations ({{count}} remediations)',
        cwl_centralized_access: 'CloudWatch centralized access from:',
        cwl_centralized_access_desc: '',
        cwl_central_security_services_account: 'Central security services account',
        cwl_central_security_services_account_desc: 'Description20',
        cwl_central_operations_account: 'Central operations account',
        cwl_central_operations_account_desc: 'Description21',
        retention_periods_for: 'Retention periods for:',
        retention_periods_for_desc: '',
        vpc_flow_logs_all_vcps: 'VPC Flow Log destination for VPCs',
        vpc_flow_logs_all_vcps_desc: '',
        vpc_flow_logs_s3: 'S3 central logging bucket',
        vpc_flow_logs_cwl: 'CloudWatch logs',
        ssm_logs_to: 'Systems Manager Session Manager log destinations',
        ssm_logs_to_desc: '',
        dns_resolver_logging_all_vpcs: 'DNS resolver logging for VPCs',
      },
      buttons: {
        configure_aws_credentials: 'Configure credentials',
        select_configuration_file: 'Select configuration file',
        export_configure_credentials: 'Configure AWS Credentials',
      },
    },
    splash: {
      category: 'Management and Governance',
      title: 'AWS Secure Environment Accelerator',
      subtitle: 'Deploy and operate a secure multi-account, multi-region AWS environment',
      description:
        'The AWS Accelerator is a tool designed to help deploy and operate secure multi-account, multi-region' +
        'AWS environments on an ongoing basis. The power of the solution is the configuration file that drives' +
        'the architecture deployed by the tool. This enables extensive flexibility and for the completely' +
        'automated deployment of a customized architecture within AWS without changing a single line of code.',
      create_configuration: 'Create configuration',
      next_step: 'Start wizard',
    },
    languages: {
      en: 'English',
      fr: 'Français',
    },
  },
  {
    currency(value: number, currency: string = 'USD'): string {
      // TODO Cache NumberFormats
      return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency,
      }).format(value);
    },
  },
);

const translate = translations.add.bind(translations);

translate(t.cidr, {
  title: 'CIDR',
  description: '',
});

translate(c.asn, {
  title: 'BGP ASN',
  description: '',
  errorMessage: 'BGP Autonomous System Number.  Value should be between 0 and 65,535.',
});

translate(c.ReplacementObject, {
  title: 'Replacement Object',
  description: '',
});

translate(c.ReplacementsConfig, {
  title: 'Replacements',
  description:
    'This section allows for the definition of variables with assigned values, which can then be referenced throughout the main config file, SCPs, or Firewall configs. Variables can be updated to reflect a customers requirements in a single spot, instead of requiring multiple updates throughout the customers configuration file(s).',
});

translate(c.ReplacementObjectValue, {
  title: 'Replacement',
  description: '',
});

translate(c.ReplacementConfigValue, {
  title: 'Replacement Type',
  description: '',
});

translate(c.ReplacementStringArray, {
  title: 'Replacement String List',
  description: '',
});

translate(c.CidrConfigType, {
  title: 'CIDR Configuration',
  description: '',
  fields: {
    pool: {
      title: 'CIDR Pool Name',
      description:
        'The name of the CIDR pool to assign IP addresses from. Value can contain any string. Only used if cidr-src is Lookup or Dynamic.',
    },
    value: {
      title: 'CIDR Value',
      description:
        'The CIDR block to assign to the VPC or subnet.  Value must be in the format 10.10.0.0/16.  Only used if cidr-src is Provided.',
    },
    size: {
      title: 'CIDR Size',
      description:
        'The size of the CIDR pool to assign to the VPC or subnet. Value must be between 16 and 28.  Only used if cidr-src is Dynamic.',
    },
  },
});

translate(c.CidrPoolConfigType, {
  title: 'CIDR Pool',
  description:
    'CIDR Pools are used to enable the automatic allocation of IP addresses to VPCs and Subnets.  Multiple named pools can be created which can each contain multiple CIDR blocks, each assigned to a specific region.',
  fields: {
    pool: {
      title: 'CIDR Pool Name',
      description:
        'The name of the CIDR pool associated with this CIDR range. Value can contain any alpha-numeric string.',
    },
    cidr: {
      title: 'CIDR Value',
      description: 'The CIDR block to assign to this CIDR pool.  Value must be in the format 10.10.0.0/16.',
    },
    region: {
      title: 'CIDR Region',
      description: 'The region the CIDR is assigned/able to be used in. Value must be in the format ca-central-1.',
    },
    description: {
      title: 'Description',
      description:
        'Description field used in the future GUI, and allows customers to provide a purpose for this CIDR pool.',
    },
  },
});

translate(c.MandatoryAccountType, {
  title: 'Deprecated',
  description: 'Deprecated',
  enumLabels: {
    master: 'Master',
    'central-security': 'Central Security',
    'central-log': 'Central Log',
    'central-operations': 'Central Operations',
  },
});

translate(c.ConfigRuleType, {
  title: 'AWS Config Rule Type',
  description: 'Type of Config rule: managed or custom',
  enumLabels: {
    managed: 'Managed',
    custom: 'Custom',
  },
});

translate(c.VirtualPrivateGatewayConfig, {
  title: 'Virtual Private Gateway Config',
  description: 'Configuration options for the VGW such as the BGP ASN',
  fields: {
    asn: {
      title: '',
      description: 'BGP Autonomous System Number for peering',
    },
  },
});

translate(c.PeeringConnectionConfig, {
  title: 'VPC Peering Connection Config',
  description:
    'VPC peering connections. While the ASEA encourages the use of TGW, VPC peering connections are also supported.',
  fields: {
    source: {
      title: 'Source Account',
      description: 'Source account for the VPC peering connection',
    },
    'source-vpc': {
      title: '',
      description: 'Source VPC for the VPC peering connection',
    },
    'source-subnets': {
      title: '',
      description: 'Source subnets for the VPC peering connection',
    },
    'local-subnets': {
      title: '',
      description: 'Local subnets for the VPC peering connection',
    },
  },
});

translate(c.NatGatewayConfig, {
  title: 'NAT Gateway Config',
  description:
    'NAT Gateways are used to translate IP addresses from one IP range to another.  Only Public NATGWs are supported at this time.',
  fields: {
    subnet: {
      title: 'NAT Gateway Subnets',
      description: 'Subnets to deploy the NAT gateway(s) into.  At this time, only public subnets are supported.',
    },
  },
});

translate(c.AlbIpForwardingConfig, {
  title: 'Deploy ALB IP Forwarder',
  description:
    'Values: true/false. When present deploys the custom ALB IP forwarding Solution which ensures front-end ALBs are always configuraed with the IP addresses of backend ALBs',
});

translate(c.AlbIpForwardingConfig, {
  title: 'Deploy ALB IP Forwarder',
  description:
    'Values: true/false. When present deploys the custom ALB IP forwarding Solution which ensures front-end ALBs are always configuraed with the IP addresses of backend ALBs',
});

translate(c.AWSNetworkFirewallConfig, {
  title: 'AWS Network Firewall Configuration',
  description: 'Deploys an AWS Network Firewall on the associated VPC and subnets.',
  fields: {
    'firewall-name': {
      title: '',
      description: 'Friendly name for the AWS Network Firwall instance.',
    },
    subnet: {
      title: '',
      description: 'Network Firewall Subnets',
    },
    policy: {},
    policyString: {},
    'flow-dest': {
      title: '',
      description: 'Valid values: None, or CloudWatch.',
    },
    'alert-dest': {
      title: '',
      description: 'Valid values: None, or CloudWatch.',
    },
  },
});

translate(c.SubnetDefinitionConfig, {
  title: 'Subnet Config',
  description:
    'After creating a VPC, subnets are deployed to specific Availability Zones using addressing from the VPCs CIDR block',
  fields: {
    az: {
      title: 'Availability Zone',
      description: 'Availability Zone to create the subnet.',
    },
    cidr: {
      title: 'Subnet CIDR Definition',
      description: 'Collection of fields used to determine the IP address space assigned to a subnet.',
    },
    'route-table': {
      title: '',
      description: 'The route table to associate with this subnet.',
    },
    disabled: {
      title: 'Subnet Disabled',
      description:
        'Define the subnet in the Accelerator to reserve the address space, but do not create it at this time.  Used to define a 3 AZ config, but deploy a 2 AZ config.',
    },
    'outpost-arn': {
      title: 'Outpost ARN',
      description: 'The ARN of the Outpost to create the subnet.',
    },
  },
});

translate(c.SubnetSourceConfig, {
  title: 'Subnet Source Config',
  description: 'Source subnet that is referenced by a Network Access Control List (NACL)',
  fields: {
    account: {
      title: '',
      description: 'AWS account name',
    },
    vpc: {
      title: '',
      description: 'Amazon VPC',
    },
    subnet: {
      title: '',
      description: 'IP subnet',
    },
  },
});

translate(c.NaclConfigType, {
  title: 'NACL Configs',
  description: 'Network Access Control List (NACL) configuration',
  fields: {
    rule: {
      title: '',
      description: 'Rule number (for example 100)',
    },
    protocol: {
      title: '',
      description:
        'The network protocol - see http://www.iana.org/assignments/protocol-numbers/protocol-numbers.xhtml for the full list',
    },
    ports: {
      title: '',
      description: 'If the protocol you selected requires a port number, enter it here',
    },
    'rule-action': {
      title: '',
      description: 'Select ALLOW to allow the specified traffic or DENY to deny the specified traffic',
    },
    egress: {
      title: '',
      description: 'Whether or not the rule is for egress access',
    },
    'cidr-blocks': {
      title: '',
      description: 'Specific IP subnets that the NACL applies to',
    },
  },
});

translate(c.SubnetConfigType, {
  title: 'Subnet Configs',
  description: 'Configuration of an IP subnet defined by the Accelerator',
  fields: {
    name: {
      title: '',
      description: 'Name of the subnet',
    },
    'share-to-ou-accounts': {
      title: 'Share To OU Accounts',
      description: 'Whether or not this subnet is shared with the AWS accounts throughout the Organization Unit (OU)',
    },
    'share-to-specific-accounts': {
      title: '',
      description: 'Whether or not this subnet is shared with specific AWS accounts',
    },
    definitions: {
      title: '',
      description: 'The mapping of subnets to Availability Zones (AZs)',
    },
    nacls: {
      title: 'NACLs',
      description: 'Network Access Control List (NACL) configuration for the subnet',
    },
  },
});

translate(c.GatewayEndpointType, {
  title: 'Gateway Endpoints',
  description:
    'Gateway VPC Endpoints deployed into the VPC. A gateway endpoint is for the following supported AWS services: Amazon S3 and DynamoDB',
  enumLabels: {
    s3: 'S3',
    dynamodb: 'DynamoDB',
  },
});

translate(c.PcxRouteConfigType, {
  title: 'Peering Connection Route Config',
  description:
    'Route table entries to send traffic to the VPC peering connection. There is a VPC peering connection between the ForSSO VPC and the Central VPC to support AWS SSO federated login using AWS Directory Service (Microsoft AD).',
  fields: {
    account: {
      title: '',
      description: 'AWS account that contains the destination VPC for the peering connection',
    },
    vpc: {
      title: '',
      description: 'Destination VPC for the peering connection',
    },
    subnet: {
      title: '',
      description: 'Destination subnet for the peering connection',
    },
  },
});

translate(c.RouteConfig, {
  title: 'Route Config',
  description: 'The configuration for routes to be added to a route table',
  fields: {
    destination: {
      title: '',
      description: 'Destination CIDR or either "s3", "DynamoDB" for a VPC Gateway endpoint.',
    },
    target: {
      title: '',
      description:
        'The target type for the next-hop, includes TGW, IGW, VGW, pcx, GWLB, NATGW_subnet_azX, NFW_subnet_azX, s3, DynamoDB, and customer. If target is set to customer, the target-id and type are required.',
    },
    name: {
      title: '',
      description: 'Name of the GWLB to be targeted.',
    },
    az: {
      title: '',
      description: 'Availability Zone (only used when targeting GWLB endpoints and EC2 based firewall appliances)',
    },
    port: {
      title: '',
      description:
        'Subnet name containing the targeted virtual appliance port (only used when targeting EC2 based firewall appliances)',
    },
    'target-id': {
      title: 'Target ID',
      description: 'The ID of the specified target, i.e. igw-12345678901234567.',
    },
    type: {
      title: 'Target Type',
      description:
        'The target type for the next hop, when created external to the ASEA. Valid values: "egressOnlyInternetGatewayId", "gatewayId", "instanceId", "localGatewayId","natGatewayId", "networkInterfaceId", "transitGatewayId", "vpcEndpointId", "vpcPeeringConnectionId".',
    },
  },
});

translate(c.RouteTableConfigType, {
  title: 'Route Table Config',
  description: 'The configuration of subnet route tables',
  fields: {
    name: {
      title: '',
      description: 'The name of the route table',
    },
    routes: {
      title: '',
      description: 'Define a list of routes for the route table in this section',
    },
  },
});

translate(c.TransitGatewayAssociationType, {
  title: 'Transit Gateway Associations',
  description: 'The type of Transit Gateway attachment, either Attach or VPN.',
  enumLabels: {
    ATTACH: 'Attach',
    VPN: 'VPN',
  },
});

translate(c.TransitGatewayAttachConfigType, {
  title: 'Transit Gateway Attach Config',
  description: 'Define the TGW attachment configuration',
  fields: {
    'associate-to-tgw': {
      title: '',
      description:
        'The name of the Transit Gateway, as defined in this configuration file, to associate. For example: Main',
    },
    account: {
      title: '',
      description:
        'The name of the AWS Account, as defined in this configuration file, that owns the Transit Gateway. For example: shared-network',
    },
    'associate-type': {
      title: '',
      description: 'The Transit Gateway attachment type. Expected values are either ATTACH or VPN',
    },
    'tgw-rt-associate': {
      title: '',
      description: 'This TGW Attachment will be associated to the TGW route table specified by this value.',
    },
    'tgw-rt-propagate': {
      title: '',
      description: 'This TGW Attachment will have its routes propagated to the route tables specified by these values',
    },
    'blackhole-route': {
      title: '',
      description:
        'Indicates whether to drop traffic that is destined to this route. True or false are expected values',
    },
    'attach-subnets': {
      title: '',
      description: 'The name of the subnet(s) where the TGW attachment will be deployed.',
    },
    options: {
      title: 'Not Implemented',
      description: 'This field not currently implemented',
    },
  },
});

translate(c.TransitGatewayRouteConfigType, {
  title: 'Transit Gateway Route Config',
  description: 'Configuration of a static route that is added to a TGW route table',
  fields: {
    destination: {
      title: '',
      description: 'The destination CIDR range for this route',
    },
    'target-tgw': {
      title: 'Target TGW',
      description: 'The target of this route is a Transit Gateway.',
    },
    'target-vpc': {
      title: 'Target VPC',
      description: 'The target of this route is a VPC.',
    },
    'target-vpn': {
      title: 'Target VPN',
      description: 'The target of this route is a VPN attachment.',
    },
    'blackhole-route': {
      title: '',
      description:
        'Indicates whether to drop traffic that is destined to this route. True or false are expected values',
    },
    'target-account': {
      title: '',
      description: 'When the route targets a VPC, indicates the name of the account which owns the VPC.',
    },
  },
});

translate(c.TransitGatewayRouteTablesConfigType, {
  title: 'Transit Gateway Route Tables Config',
  description: 'Configuration of a Transit Gateway route table',
  fields: {
    name: {
      title: '',
      description: 'Name of the TGW route table',
    },
    routes: {
      title: '',
      description: 'Specific static routes that are incliuded in this TGW route table',
    },
  },
});

translate(c.TransitGatewayAttachDeploymentConfigType, {
  title: 'Transit Gateway Attach Deployment Config',
  description: 'Configuration used to enabled cross-region TGW peering.',
  fields: {
    'associate-to-tgw': {
      title: 'Remote TGW Name',
      description: 'The name of an Accelerator defined TGW in another AWS region to peer this TGW with.',
    },
    account: {
      title: '',
      description: 'The AWS account name containing the remote TGW to peer with.',
    },
    region: {
      title: '',
      description: 'The region containing the remote TGW to peer with.',
    },
    'tgw-rt-associate-local': {
      title: 'Local TGW route table',
      description: 'The route table on the local TGW to attach the peering connection.',
    },
    'tgw-rt-associate-remote': {
      title: 'Remote TGW route table',
      description: 'The route table on the remote TGW to attach the peering connection.',
    },
  },
});

translate(c.InterfaceEndpointConfig, {
  title: 'Interface Endpoint Config',
  description:
    'This section allows the creation of Interface endpoints which allows you to connect to services powered by AWS PrivateLink. The centralized model architecture recommends defining centralized interface endpoints once an enable routing from other VPCs',
  fields: {
    subnet: {
      title: '',
      description: 'The subnet within which to create the interface endpoint',
    },
    endpoints: {
      title: '',
      description: 'Define a list of interface endpoints in this section',
    },
    'allowed-cidrs': {
      title: 'Allowed CIDRs',
      description: 'Override the default 0.0.0.0/0 inbound Security Group rule with an array of allowed CIDR ranges.',
    },
  },
});

translate(c.ResolversConfigType, {
  title: 'Route53 Resolvers Config',
  description:
    'Create a Route 53 resolver in this account. You can integrate DNS resolution between the Resolver in the VPC and this resolver',
  fields: {
    subnet: {
      title: '',
      description: 'The subnet for the centralized resolver. (Must be a subnet in the account VPC)',
    },
    outbound: {
      title: '',
      description: 'DNS resolvers on your network can forward DNS queries to Route 53 Resolver via this endpoint',
    },
    inbound: {
      title: '',
      description: 'Resolver conditionally forwards queries to resolvers on your network via this endpoint',
    },
  },
});

translate(c.OnPremZoneConfigType, {
  title: 'On Premises Zone Config',
  description: 'On Prem DNS zones configuration',
  fields: {
    zone: {
      title: '',
      description: 'On Prem zone',
    },
    'outbound-ips': {
      title: 'Outbound IPs',
      description: 'On Prem resolver IPs for this zone',
    },
  },
});

translate(c.SecurityGroupSourceConfig, {
  title: 'Security Group Source Config',
  description: 'Security group source configuration',
  fields: {
    'security-group': {
      title: 'Security Group source',
      description: 'The source of the traffic. For example IP address ranges or other security groups',
    },
  },
});

translate(c.SecurityGroupRuleConfigType, {
  title: 'Security Group Rule Config',
  description: 'Security group rule configuration',
  fields: {
    type: {
      title: '',
      description: 'Optional description for the security group',
    },
    'tcp-ports': {
      title: '',
      description: 'TCP ports',
    },
    'udp-ports': {
      title: '',
      description: 'UDP ports',
    },
    port: {
      title: '',
      description: 'Specific TCP or UDP port for custom types',
    },
    description: {
      title: '',
      description: 'Optional description',
    },
    toPort: {
      title: '',
      description:
        'The end of a port range for the TCP and UDP protocols, or an ICMP/ICMPv6 code. A value of -1 indicates all ICMP/ICMPv6 codes. If you specify all ICMP/ICMPv6 types, you must specify all codes',
    },
    fromPort: {
      title: '',
      description:
        'The start of a port range for the TCP and UDP protocols, or an ICMP/ICMPv6 type number. A value of -1 indicates all ICMP/ICMPv6 types. If you specify all ICMP/ICMPv6 types, you must specify all codes',
    },
    source: {
      title: '',
      description: 'The source of the traffic. For example IP address ranges or other security groups',
    },
  },
});

translate(c.SecurityGroupConfigType, {
  title: 'Security Group Config',
  description:
    'A security group acts as a virtual firewall for your instance to control inbound and outbound traffic. When you launch an instance in a VPC, you can assign up to five security groups to the instance. Security groups act at the instance level, not the subnet level. Therefore, each instance in a subnet in your VPC can be assigned to a different set of security groups',
  fields: {
    name: {
      title: '',
      description: 'Name of the security group',
    },
    'inbound-rules': {
      title: '',
      description:
        'You can add rules for a security group. Rule in this section apply to inbound traffic (ingress) or ',
    },
    'outbound-rules': {
      title: '',
      description: 'You can add rules for a security group. Rule in this section apply to outbound traffic (egress)',
    },
  },
});

translate(c.ZoneNamesConfigType, {
  title: 'Route53 Zone Types',
  description: 'Configuration for DNS zones hosted in Route 53',
  fields: {
    public: {
      title: '',
      description:
        'A public hosted zone is a container that holds information about how you want to route traffic on the internet for a specific domain, such as example.com, and its subdomains ',
    },
    private: {
      title: '',
      description:
        'A private hosted zone is a container that holds information about how you want Amazon Route 53 to respond to DNS queries for a domain and its subdomains within one or more VPCs that you create with the Amazon VPC service',
    },
  },
});

translate(c.FlowLogsDestinationTypes, {
  title: 'VPC Flow Log Destination Types',
  description: 'Flow logs can publish flow log data directly to Amazon CloudWatc, directly to S3, both or none',
  enumLabels: {
    S3: 'S3',
    CWL: 'CloudWatch',
    BOTH: 'Both',
    NONE: 'None',
  },
});

translate(c.VpcConfigType, {
  title: 'VPC Config',
  description:
    'Either: a) defines and creates the VPC(s) that will be shared with every account in an OU, or b) defines and creates the VPC(s) in every account in an OU, or c) defines and creates VPC(s) inside an account.  VPCs should generally be defined at the OU level (either centrally created and shared, or templated and locally deployed), versus at the account level.',
  fields: {
    deploy: {
      title: '',
      description:
        '"local" if being configured inside an account or "shared-network" if being configured inside an OU.',
    },
    name: {
      title: 'VPC Name',
      description: 'The name of the VPC that will be deployed inside the account.',
    },
    description: {
      title: 'Description',
      description: 'Description field used in the future GUI, and allows customers to provide a purpose for this VPC.',
    },
    region: {
      title: '',
      description: 'Region for the VPC.',
    },
    cidr: {
      title: 'VPC CIDR Range',
      description: 'CIDR range for the VPC.',
    },
    'cidr-src': {
      title: 'CIDR Source',
      description:
        'One of: Provided, Lookup, Dynamic.  Provided retrieves CIDR range from the config file, Lookup queries a DynamoDB table for the CIDR block, Dynamic automatically assigns a new CIDR block from the designated pool.',
    },
    'opt-in': {
      title: 'Opt-In VPC',
      description:
        'Enables a VPC to be defined in an OU and created in an account, but only once the account has opted in, will the VPC be created.',
    },
    'dedicated-tenancy': {
      title: '',
      description: 'Enables the creation of Dedicated Tenancy VPCs',
    },
    'use-central-endpoints': {
      title: '',
      description:
        'Use VPC endpoints defined by the VPC with the central-endpoint value set to true.  Associates the designated endpoint Route53 Zone with this VPC.',
    },
    'dns-resolver-logging': {
      title: '',
      description: 'Enables DNS resolver logging for this VPC (log all DNS queries made by resources within the VPC)',
    },
    'flow-logs': {
      title: '',
      description: 'Enables VPC flow logging on the VPC.  Values: Accept, Reject, or BOTH',
    },
    'log-retention': {
      title: 'Deprecated',
      description: 'Deprecated.',
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
    natgw: {
      title: 'NAT Gateway',
      description: 'Create a NAT gateway.',
    },
    nfw: {
      title: 'AWS Network Firewall',
      description: 'Create the AWS NFW',
    },
    'alb-forwarding': {
      title: 'ALB IP Forwarding',
      description: 'Enable ALB to ALB forwarding with IPv4 lookup',
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
      title: 'TGW Attachment',
      description: 'Attach this VPC to a transit gateway.',
    },
    'interface-endpoints': {
      title: '',
      description:
        'Deploy interface endpoints. The reference architecture prescribes centralized endpoints in the shared network account that are then shared through the TGW. You can start by adding on initial ones or provide a complete list so that they don’t need to be created in the future. There is a cost per interface endpoint.',
    },
    resolvers: {
      title: '',
      description:
        'Create a Route 53 resolver in this account. You can integrate DNS resolution between the Resolver in the VPC and this resolver',
    },
    'on-premise-rules': {
      title: 'On Premises Rules',
      description: 'On Prem DNS zones configuration',
    },
    'security-groups': {
      title: '',
      description: 'Security groups for theVPC',
    },
    zones: {
      title: '',
      description: 'Create route 53 hosted zones',
    },
    'central-endpoint': {
      title: '',
      description: 'Use central endpoints for this VPC',
    },
    'lgw-route-table-id': {
      title: 'Local Gateway Route Table ID',
      description: 'The route table ID to associate a VPC to a local zone.',
    },
  },
});

translate(c.IamUserConfigType, {
  title: 'IAM User Config',
  description: 'IAM user creation is discouraged except for certain exceptions. Use this feature with caution',
  fields: {
    'user-ids': {
      title: 'User IDs',
      description: 'List of user IDs to create',
    },
    group: {
      title: '',
      description: 'Groups to which the user(s) will be added.',
    },
    policies: {
      title: '',
      description: 'Policies attached to the user(s)',
    },
    'boundary-policy': {
      title: '',
      description: 'Boundary policies attached to the user(s)',
    },
  },
});

translate(c.IamPolicyConfigType, {
  title: 'IAM Policy Config',
  description: 'Configure an IAM policy in IAM for this account',
  fields: {
    'policy-name': {
      title: '',
      description: 'Name of the IAM policy',
    },
    policy: {
      title: '',
      description: '.txt file that contains the policy definition',
    },
  },
});

translate(c.IamRoleConfigType, {
  title: 'IAM Role Config',
  description: 'Configure an IAM Role in IAM for this account',
  fields: {
    role: {
      title: '',
      description: 'Name of the role',
    },
    type: {
      title: '',
      description: 'Type of role: i.e. EC2',
    },
    policies: {
      title: '',
      description: 'Permission policies attached to the role. These policies must be defined in the Policy section',
    },
    'boundary-policy': {
      title: '',
      description:
        'Boundary policies attached to the role. This boundary policies must be defined in the Boundary Policy section',
    },
    'source-account': {
      title: '',
      description:
        'If the role is to be assumed by another AWS account, provide the account name as defined in the config file ',
    },
    'source-account-role': {
      title: '',
      description: 'Role assumed in the source account',
    },
    'trust-policy': {
      title: '',
      description: 'Trust policy for the role',
    },
    'ssm-log-archive-access': {
      title: '',
      description: 'This field is DEPRECATED, please use ssm-log-archive-write-access',
    },
    'ssm-log-archive-write-access': {
      title: '',
      description: 'Set to true to grant this role write access to the log archive buckets.',
    },
    'ssm-log-archive-read-only-access': {
      title: '',
      description: 'Set to true to grant this role read-only access to the log archive buckets.',
    },
    'meta-data-read-only-access': {
      title: '',
      description: 'Set to true to grant this role read-only access to the metadata bucket in the log archive account.',
    },
  },
});

translate(c.IamConfigType, {
  title: 'IAM Config',
  description:
    'IAM configuration for defining users, policies and roles, defined either in `organizational-units` or `account-configs`.',
  fields: {
    users: {
      title: 'IAM Users',
      description: 'IAM Users',
    },
    policies: {
      title: 'IAM Policies',
      description: 'IAM Policies',
    },
    roles: {
      title: 'IAM Roles',
      description: 'IAM Roles',
    },
  },
});

translate(c.ImportCertificateConfigType, {
  title: 'Import Certificate Config',
  description:
    'This mechanism allows a customer to generate certificates using their existing tools and processes and import 3rd party certificates into AWS Certificate Manager for use in AWS. This can be defined at either the account or OU level.',
  fields: {
    name: {
      title: '',
      description: 'Name of the certificate',
    },
    type: {
      title: '',
      description: 'Set to import for imported certificates',
    },
    'priv-key': {
      title: '',
      description: 'Private key file path in Central S3 bucket',
    },
    cert: {
      title: '',
      description: 'Certificate file path in Central S3 bucket',
    },
    chain: {
      title: '',
      description: 'Chain file path in Central S3 bucket',
    },
  },
});

translate(c.CertificateValidationType, {
  title: 'Certificate Types',
  description: 'Validation method for the certificate being generated in ACM, either DNS or Email',
  enumLabels: {
    DNS: 'DNS',
    EMAIL: 'Email',
  },
});

translate(c.RequestCertificateConfigType, {
  title: 'Certificate Request Config',
  description:
    'This mechanism allows a customer to generate new public certificates directly in ACM. This can be defined at either the account or OU level.',
  fields: {
    name: {
      title: '',
      description: 'Certificate name.',
    },
    type: {
      title: '',
      description: 'Set to request certificates from ACM.  Valid values include: import or request.',
    },
    domain: {
      title: '',
      description: 'Certificates DNS domain.',
    },
    validation: {
      title: '',
      description: 'Certificates validation method, either: DNS or Email.',
    },
    san: {
      title: 'SAN',
      description: 'Certificates Subject Alternative Names (SAN).',
    },
  },
});

translate(c.CertificateConfigType, {
  title: 'Certificate Config',
  description:
    'The Accelerator installation process allows customers to provide their own certificates (either self-signed or generated by a CA), to enable quick and easy installation and allowing customers to test end-to-end traffic flows. After the initial installation, we recommend customers leverage AWS Certificate Manager (ACM) to easily provision, manage, and deploy public and private SSL/TLS certificates. ACM helps manage the challenges of maintaining certificates, including certificate rotation and renewal, so you don’t have to worry about expiring certificates.',
});

translate(c.TgwDeploymentConfigType, {
  title: 'TGW Deployment Config',
  description:
    'The centralized networking architecture for the Accelerator uses a Transit Gateway for traffic flows between VPCs and for external connectivity',
  fields: {
    name: {
      title: '',
      description: 'Name of the TGW',
    },
    region: {
      title: '',
      description: 'Region to deploy the TGW',
    },
    asn: {
      title: 'BGP ASN',
      description: 'BGP Autonomous System Number',
    },
    features: {
      title: '',
      description:
        'DNS-support,VPN-ECMP-support,Default-route-table-association,Default-route-table-propagation,Auto-accept-sharing-attachments',
    },
    'route-tables': {
      title: '',
      description: 'Route tables of the TGW',
    },
    'tgw-attach': {
      title: 'TGW Attach',
      description: 'Attach to another TGW',
    },
    'tgw-routes': {
      title: 'TGW Routes',
      description: 'TGW routes',
    },
  },
});

translate(c.PasswordPolicyType, {
  title: 'MAD Password Policy',
  description:
    'AWS Managed Microsoft AD enables you to define and assign different fine-grained password and account lockout policies (also referred to as fine-grained password policies) for groups of users you manage in your AWS Managed Microsoft AD domain',
  fields: {
    history: {
      title: '',
      description: 'Enforce password history.',
    },
    'max-age': {
      title: '',
      description: 'Maximum password age.',
    },
    'min-age': {
      title: '',
      description: 'Minimum password age.',
    },
    'min-len': {
      title: '',
      description: 'Minimum password length.',
    },
    complexity: {
      title: '',
      description: 'Password must meet complexity requirements.',
    },
    reversible: {
      title: '',
      description: 'Store passwords using reversible encryption.',
    },
    'failed-attempts': {
      title: '',
      description:
        'Specifies the number of unsuccessful login attempts that are permitted before an account is locked out.',
    },
    'lockout-duration': {
      title: '',
      description:
        'Specifies the length of time that an account is locked after the number of failed login attempts exceeds the lockout threshold.',
    },
    'lockout-attempts-reset': {
      title: '',
      description:
        'Specifies the maximum time interval between two unsuccessful login attempts before the number of unsuccessful login attempts is reset to 0.',
    },
  },
});

translate(c.ADUserConfig, {
  title: 'MAD User Config',
  description:
    'Users to be created initially in the MAD, further user creation must be performed using AD management tools',
  fields: {
    user: {
      title: '',
      description: 'User name',
    },
    email: {
      title: '',
      description: 'Email address of the user',
    },
    groups: {
      title: '',
      description: 'AD groups the user belongs to',
    },
  },
});

translate(c.MadConfigType, {
  title: 'MAD Config',
  description: 'Microsoft Active Directory configuration',
  fields: {
    description: {
      title: 'Description',
      description: 'Description field used in the future GUI, and allows customers to provide a purpose for this MAD.',
    },
    'dir-id': {
      title: '',
      description: 'MAD directory ID',
    },
    deploy: {
      title: '',
      description: 'Set to true to deploy this MAD or to false if only being defined in the Accelerator',
    },
    'vpc-name': {
      title: 'MAD VPC Name',
      description: 'Name of the VPC to deploy the MAD to',
    },
    region: {
      title: '',
      description: 'Region to deploy the MAD ',
    },
    subnet: {
      title: '',
      description: 'Subnets to deploy the MAD ',
    },
    azs: {
      title: '',
      description: 'Availability zones for the underlying MAD instances',
    },
    size: {
      title: 'MAD Size',
      description:
        'Standard or Enterprise. AWS Managed Microsoft AD (Standard Edition) is optimized to be a primary directory for small and midsize businesses with up to 5,000 employees. It provides you enough storage capacity to support up to 30,000* directory objects, such as users, groups, and computers. AWS Managed Microsoft AD (Enterprise Edition) is designed to support enterprise organizations with up to 500,000* directory objects',
    },
    'image-path': {
      title: 'RDGW Image Path',
      description:
        'The SSM AMI ID of the image used to bootstrap the RDGW instance. This should point to the variable for the latest image ID.',
    },
    'dns-domain': {
      title: 'MAD DNS Domain Name',
      description: 'MAD DNS Domain',
    },
    'netbios-domain': {
      title: 'MAD Netbios Domain Name',
      description: 'MAD Netbios Domain',
    },
    'central-resolver-rule-account': {
      title: '',
      description:
        'Integrate DNS resolution between MAD and the endpoint VPC. Provide the account for the endpoint VPC',
    },
    'central-resolver-rule-vpc': {
      title: '',
      description: 'Name of the endpoint VPC or the VPC that implements the centralized resolvers',
    },
    'log-group-name': {
      title: '',
      description: 'CWL log group name for MAD',
    },
    'share-to-account': {
      title: '',
      description:
        'Share the MAD to other accounts. This is typically left blank and the share-mad-from parameter at the OU level is leveraged',
    },
    restrict_srcips: {
      title: 'Restrict source IPs',
      // eslint-disable-next-line no-template-curly-in-string
      description: 'Restrict access to the MAD interface to this source IPs defined in ${RANGE-RESTRICT}',
    },
    'rdgw-instance-type': {
      title: 'Remote Desktop Gateway EC2 instance type',
      description: 'To manage the MAD the Accelerator deploys an EC2 instance to serve as a Remote Desktop Gateway',
    },
    'rdgw-enforce-imdsv2': {
      title: 'Enforce IMDSv2 on the EC instances launched for Remote Desktop Gateway',
      description: 'If set to true, IMDSv2 will be mandatory on the instances. Default : false',
    },
    'rdgw-instance-role': {
      title: 'Remote Desktop Gateway instance role',
      description: 'EC2 instance role assumed by the RDGW',
    },
    'num-rdgw-hosts': {
      title: 'Number of RDGW Hosts',
      description: 'Desired number of instances in the RDGW auto-scaling group ',
    },
    'rdgw-max-instance-age': {
      title: 'RDGW Max Instance Age',
      description:
        'EC2 Auto Scaling lets you safely and securely recycle instances in at a regular cadence. The Maximum Instance Lifetime parameter helps you ensure that instances are recycled before reaching the specified lifetime in days.',
    },
    'min-rdgw-hosts': {
      title: 'Min RDGW Hosts',
      description: 'Minimum number of instances in the RDGW auto-scaling group',
    },
    'max-rdgw-hosts': {
      title: 'Max RDGW Hosts',
      description: 'Maximum number of instances in the RDGW auto-scaling group',
    },
    'password-policies': {
      title: 'Active Directory Password Policies',
      description: 'Password policies for MAD users. Only set on Accelerator initial installation.',
    },
    'ad-groups': {
      title: 'Active Directory Groups',
      description:
        'Groups to create within the MAD instance. Only executed on Accelerator initial installation (used to speed initial installs).',
    },
    'ad-per-account-groups': {
      title: 'AD per Account Groups',
      description:
        'Create these AD groups within MAD for every Shared account in Accelerator. Only executed on Accelerator initial installation (used to speed initial installs).',
    },
    'adc-group': {
      title: 'AWS ADC Group',
      description:
        'AWS Active Directory Connector (ADC) group to be created and assigned appropriate permissions within MAD. Only executed on Accelerator initial installation.',
    },
    'ad-users': {
      title: 'Active Directory Users',
      description:
        'Users to create within the MAD instance. Only executed on Accelerator initial installation (used to speed initial installs).',
    },
    'security-groups': {
      title: '',
      description: 'AWS security groups to associate to the MAD EC2 instances',
    },
    'password-secret-name': {
      title: '',
      description:
        'A Secret ARN containing the MAD root user password. This is only used for customers that have iupgraded from v1.0.4.',
    },
  },
});

translate(c.RsyslogSubnetConfig, {
  title: 'Rsyslog Subnet Config',
  description: 'Rsyslog subnet configuration',
  fields: {
    name: {
      title: '',
      description: 'Rsyslog Subnet name',
    },
    az: {
      title: '',
      description: 'Rsyslog Subnet Availability zone',
    },
  },
});

translate(c.RsyslogConfig, {
  title: 'Rsyslog Config',
  description:
    'The Accelerator deploys Rsyslog instances to capture logs from 3rd party systems such as firewalls these logs are then sent to CWL',
  fields: {
    deploy: {
      title: 'Deploy',
      description: 'Set to true to deploy this Rsyslog configuration',
    },
    'vpc-name': {
      title: 'VPC name',
      description: 'Name of the VPC for the Rsyslog',
    },
    region: {
      title: ' ',
      description: 'Region name for the Rsyslog',
    },
    'log-group-name': {
      title: 'Log group name',
      description: 'The log group in CWL where the logs will be sent',
    },
    'security-groups': {
      title: ' ',
      description: 'Security group configuration for the Rsyslog',
    },
    'app-subnets': {
      title: 'Application subnets',
      description: 'Subnet used to deploy the rsyslog instances.',
    },
    'web-subnets': {
      title: 'Web subnets',
      description: 'Subnet used to deploy the NLB.',
    },
    'min-rsyslog-hosts': {
      title: 'Minimum number of rsyslog hosts',
      description: 'Rsyslog is defined in an Auto-scaling group this defines the minimum number of hosts',
    },
    'desired-rsyslog-hosts': {
      title: 'Desired number of rsyslog hosts',
      description: 'Rsyslog is defined in an Auto-scaling group this defines the desired number of hosts',
    },
    'max-rsyslog-hosts': {
      title: 'Maximum number of rsyslog hosts',
      description: 'Rsyslog is defined in an Auto-scaling group this defines the maximum number of hosts',
    },
    'ssm-image-id': {
      title: 'SSM image id',
      description: 'The SSM image name used to retreive the latest Amazon Linux 2 AMI ID.',
    },
    'rsyslog-instance-type': {
      title: 'rsyslog Instance type',
      description: 'The EC2 instance type for the rsyslog instances (i.e. t3.large)',
    },
    'rsyslog-enforce-imdsv2': {
      title: 'Enforce IMDSv2 on the EC instances launched for rsyslog',
      description: 'If set to true, IMDSv2 will be mandatory on the instances. Default : false',
    },
    'rsyslog-instance-role': {
      title: 'Instance role',
      description: 'The EC2 instance role assumed by the rsyslog instances',
    },
    'rsyslog-root-volume-size': {
      title: 'Root volume size',
      description: 'Root volume size for the rsyslog instances',
    },
    'rsyslog-max-instance-age': {
      title: 'rsyslog max instance age',
      description:
        'The number of days before the auto-scaling group replaces any instance. This ensures a clean image is always deployed and if the state machine has been executed, will deploy the most recent patch release of the AMI.',
    },
    'user-data': {
      title: 'user data',
      description: 'Override the default user data EC2 init script.',
    },
  },
});

translate(c.ElbTargetInstanceFirewallConfigType, {
  title: 'ALB Target Firewall Instance',
  description: 'Used in the perimeter ALBs for routing traffic to firewalls in the perimeter VPC',
  fields: {
    target: {
      title: 'Target type',
      description: 'Always set to ‘firewall’ in this section’',
    },
    name: {
      title: 'Target name',
      description: 'The name of the Firewall defined in deployments/firewall/”name”:',
    },
    az: {
      title: 'AZ of the target',
      description: 'Availability Zone of the target firewall',
    },
  },
});

translate(c.ElbTargetConfigType, {
  title: 'ALB Target Config',
  description:
    'Used to define the target group configuration for an ELB deployment, per the defined configuration, in either the `account-configs` or `organizational-units` sections of the config file.',
  fields: {
    'target-name': {
      title: '',
      description: 'Name of the target',
    },
    'target-type': {
      title: '',
      description:
        'When you create a target group, you specify its target type, which determines the type of target you specify when registering targets with this target group. values: instance, ip, lambda',
    },
    protocol: {
      title: '',
      description: 'HTTP or HTTPS',
    },
    port: {
      title: '',
      description: 'TCP Port of the target: 1-65535',
    },
    'health-check-protocol': {
      title: '',
      description:
        'The protocol the load balancer uses when performing health checks on targets. The possible protocols are HTTP and HTTPS. The default is the HTTP protocol',
    },
    'health-check-path': {
      title: '',
      description: 'The destination for health checks on the targets.',
    },
    'health-check-port': {
      title: '',
      description:
        'The port the load balancer uses when performing health checks on targets. The default is to use the port on which each target receives traffic from the load balancer',
    },
    'lambda-filename': {
      title: '',
      description:
        'You can register a single Lambda function with each target group. Elastic Load Balancing must have permissions to invoke the Lambda function',
    },
    'target-instances': {
      title: '',
      description: 'Array of specific instances to be used as targets',
    },
    'tg-weight': {
      title: '',
      description: 'Priority of the target',
    },
  },
});

translate(c.AlbConfigType, {
  title: 'ALB Config',
  description:
    'Used to define an ELB (ALB or GWLB) deployment, per the defined configuration, in either the `account-configs` or `organizational-units` sections of the config file.',
  fields: {
    type: {
      title: '',
      description: 'Defaults to ALB, valid values: ALB, GWLB',
    },
    name: {
      title: '',
      description: 'Name of the ALB',
    },
    scheme: {
      title: '',
      description:
        'Either internet-facing or internal.  An internet-facing load balancer routes requests from clients over the internet to targets. An internal load balancer routes requests to targets using private IP addresses. ',
    },
    'action-type': {
      title: '',
      description: 'The only supported action type is forward.',
    },
    'ip-type': {
      title: 'IP Type',
      description: 'The only supported IP type is ipv4.',
    },
    listeners: {
      title: '',
      description:
        'Before you start using your Application Load Balancer, you must add one or more listeners. A listener is a process that checks for connection requests, using the protocol and port that you configure. The rules that you define for a listener determine how the load balancer routes requests to its registered targets',
    },
    ports: {
      title: '',
      description: 'Ports that the ALB listens on.',
    },
    vpc: {
      title: 'VPC',
      description: 'VPC that the ALB is attached',
    },
    subnets: {
      title: '',
      description: 'Name of the subnets the ALB is attached.',
    },
    'cert-name': {
      title: 'Certificate Name',
      description: 'Name of an imported certificate defined in the configuration of the Accelerator',
    },
    'cert-arn': {
      title: 'Certificate ARN',
      description: 'ARN of certificate requested to ACM',
    },
    'security-policy': {
      title: '',
      description:
        'Application Load Balancers and Network Load Balancers now support three new security policies for forward secrecy: ELBSecurityPolicy-FS-1-2-2019-08, ELBSecurityPolicy-FS-1-1-2019-08 and ELBSecurityPolicy-FS-1-2-Res-2019-08.',
    },
    'security-group': {
      title: '',
      description:
        'You must ensure that your load balancer can communicate with registered targets on both the listener port and the health check port',
    },
    'tg-stickiness': {
      title: 'Target Group Stickiness',
      description:
        'Duration-based stickiness routes requests to the same target in a target group using a load balancer generated cookie (AWSALB). The cookie is used to map the session to the target',
    },
    'target-alarms-notify': {
      title: '',
      description: 'Not Implemented.',
    },
    'target-alarms-when': {
      title: '',
      description: 'Not Implemented.',
    },
    'target-alarms-of': {
      title: '',
      description: 'Not Implemented.',
    },
    'target-alarms-is': {
      title: '',
      description: 'Not Implemented.',
    },
    'target-alarms-Count': {
      title: '',
      description: 'Not Implemented.',
    },
    'target-alarms-for': {
      title: '',
      description: 'Not Implemented.',
    },
    'target-alarms-periods-of': {
      title: '',
      description: 'Not Implemented.',
    },
    'access-logs': {
      title: '',
      description: 'boolean true or false to enable or not the access logs',
    },
    targets: {
      title: '',
      description: 'Targets for the ALB',
    },
    'apply-tags': {
      title: '',
      description: 'Enables customers to apply customer specified tags to the ALB (Only tested on GWLBs).',
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
      description: 'Enables customers to apply customer specified tags to the GWLB.',
    },
  },
});

translate(c.AdcConfigType, {
  title: 'Active Directory Connector Config',
  description:
    'This deployment provides a mechanism to sync identities created in the AWS MAD and use them for SSO in the organizational management acount',
  fields: {
    deploy: {
      title: '',
      description: 'Set to true to perform the actual deployment or to false to only define it in the accelerator',
    },
    'vpc-name': {
      title: 'VPC Name',
      description:
        'Name of the VPC to deploy the ADC. In the prescriptive architecture this is would be the ForSSO VPC in the organizational management acount. This VPC also needs a VPC peering connection (pcx) to the Central VPC in the account where  MAD is deployed',
    },
    subnet: {
      title: '',
      description: 'Name of the subnet to deploy the ADC',
    },
    azs: {
      title: '',
      description: 'Availability zones of the ADC',
    },
    size: {
      title: '',
      description: ' AD Connector comes in two sizes, small and large',
    },
    restrict_srcips: {
      title: '',
      description: 'Restrict to these source IP addresses: ussualy the ForSSO VPC and the MAD IP address ranges',
    },
    'connect-account-key': {
      title: 'Name of the account where the AWS MAD is deployed',
    },
    'connect-dir-id': {
      title: 'Connect to Directory ID',
      description: 'ID given to the MAD deployment in the operations account',
    },
  },
});

translate(c.FirewallPortConfigPrivateIpType, {
  title: 'Firewall Port Private IP Configuration',
  description: 'Optionally choose a private static IP address.  Assure the IP is available and within the subnet.',
  fields: {
    ip: {
      title: '',
      description: 'IP Address x.x.x.x for this ports subnet',
    },
    az: {
      title: '',
      description: 'Availability zone for this IP Address',
    },
  },
});

translate(c.FirewallPortConfigType, {
  title: 'Firewall Port Config',
  description:
    'Different ports are defined on the firewall to implement the required security and networking architecture',
  fields: {
    name: {
      title: '',
      description: 'Name of the firewall port',
    },
    subnet: {
      title: '',
      description: 'Subnet the port is connected to',
    },
    'create-eip': {
      title: '',
      description: 'Set to true to create an Elastic IP and associate it to this port',
    },
    'create-cgw': {
      title: '',
      description: 'Set to true to create a customer gateway on this port',
    },
    'private-ips': {
      title: '',
      description: 'Optionally define static private ip addresses for each subnet port and subnet',
    },
  },
});

translate(c.FirewallEC2ConfigType, {
  title: 'Firewall EC2 Config',
  description:
    'Accelerator supports deploying 3rd party firewalls. Define the parameters for the Firewall EC2 instances in this section',
  fields: {
    type: {
      title: '',
      description: '3rd party firewall type',
    },
    name: {
      title: '',
      description: 'Firewall name referenced in the internet facing ELB configuration',
    },
    'instance-sizes': {
      title: '',
      description: 'EC2 instance type',
    },
    'image-id': {
      title: '',
      description: 'AMI image ID',
    },
    'enforce-imdsv2': {
      title: 'Enforce IMDSv2 on the EC instances launched for firewalls',
      description: 'If set to true, IMDSv2 will be mandatory on the firewall instances. Default : false',
    },
    region: {
      title: '',
      description: 'Region to deploy the firewall',
    },
    vpc: {
      title: 'VPC',
      description: 'The VPC name to deploy the firewall instances into.',
    },
    'security-group': {
      title: '',
      description: 'Security group associated to the firewall EC2 instance',
    },
    ports: {
      title: '',
      description: 'Define the firewall port characteristics in this section',
    },
    license: {
      title: '',
      description: 'Provide the path in the central s3 bucket for the firewall license',
    },
    config: {
      title: '',
      description: 'Provide the path in the central s3 bucket for the firewall configuration',
    },
    'fw-instance-role': {
      title: '',
      description: 'Instance role assumed by the firewall',
    },
    'fw-cgw-name': {
      title: 'Firewall CGW Name',
      description: 'Friendly name to call the CGW.',
    },
    'fw-cgw-asn': {
      title: 'Firewall CGW BGP ASN',
      description: 'Customer supplied BGP ASN value .',
    },
    'fw-cgw-routing': {
      title: 'Firewall CGW Routing Type',
      description: 'Dynamic or Static',
    },
    'tgw-attach': {
      title: 'Transit Gateway Attachment',
      description: 'Perimeter firewalls can attach to the centralized TGW through tunnels',
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
      description:
        'Enables customers to apply customer specified tags to the deployed Firewalls (only tested with autoscale).',
    },
    bootstrap: {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallCGWConfigType, {
  title: 'Firewall CGW Config',
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
      description:
        'Enables customers to apply customer specified tags to the deployed Firewalls(only tested with autoscale).',
    },
  },
});

translate(c.FirewallAutoScaleConfigType, {
  title: '',
  description: '',
  fields: {
    type: {
      title: '',
      description: 'Can be EC2, CGW, or autoscale',
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
      description: 'The prefered number of instances.',
    },
    'fw-instance-role': {
      title: 'Role',
      description: '',
    },
    'image-id': {
      title: '',
      description: '',
    },
    'enforce-imdsv2': {
      title: 'Enforce IMDSv2 on the EC instances launched for firewalls',
      description: 'If set to true, IMDSv2 will be mandatory on the instances. Default : false',
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
      description: 'Used with auto-scale',
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
      description: 'The VPC name to deploy the firewall instances into.',
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
      title: 'Create EIP',
      description: '',
    },
    'apply-tags': {
      title: '',
      description: 'Enables customers to apply customer specified tags to the deployed Firewalls.',
    },
    bootstrap: {
      title: '',
      description: '',
    },
  },
});

translate(c.FirewallManagerConfigType, {
  title: 'Firewall Manager Configuration',
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
      title: 'Image ID',
      description: '',
    },
    'enforce-imdsv2': {
      title: 'Enforce IMDSv2 on the EC instance launched for firewall manager',
      description: 'If set to true, IMDSv2 will be mandatory on the instance. Default : false',
    },
    region: {
      title: '',
      description: '',
    },
    vpc: {
      title: '',
      description: 'The VPC name to deploy the firewall instances into.',
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
      title: 'Create EIP',
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
      title: 'Role',
      description: '',
    },
  },
});

translate(c.LandingZoneAccountType, {
  title: '',
  description: 'Deprecated',
  enumLabels: {
    primary: 'primary',
    security: 'security',
    'log-archive': 'log-archive',
    'shared-services': 'shared-services',
  },
});

translate(c.BaseLineConfigType, {
  title: 'INTERNAL FIELD',
  description: 'Config type not exposed to the end user',
  enumLabels: {
    LANDING_ZONE: 'Landing Zone',
    ORGANIZATIONS: 'Organizations',
    CONTROL_TOWER: 'Control Tower',
  },
});

translate(c.DeploymentConfigType, {
  title: 'Deployments',
  description:
    'This section is used define the deployment configuration for higher level objects like like rsyslog clusters, 3rd party firewalls and management appliances, Transit Gateways, and directory services like MAD and ADCs within an account.  Directory service deployments only supported in mandatory-accounts.',
  fields: {
    tgw: {
      title: 'TGW',
      description: 'Deploys Transit Gateways',
    },
    mad: {
      title: 'MAD',
      description: 'Deploy an AWS Managed Active Directory (MAD)',
    },
    rsyslog: {
      title: '',
      description: 'Deploy an rsyslog cluster',
    },
    adc: {
      title: 'ADC',
      description: 'Deploy an Active Directory Connector',
    },
    firewalls: {
      title: '',
      description: 'Deploys 3rd party firewalls',
    },
    'firewall-manager': {
      title: '',
      description: 'Deploy a 3rd party Firewall Management Appliance',
    },
  },
});

translate(c.BudgetNotificationType, {
  title: 'Budget Notifications',
  description: 'Budget notifications configuration',
  fields: {
    type: {
      title: '',
      description:
        'Whether the notification is for how much you have spent (Actual) or for how much you are forecasted to spend (Forecasted)',
    },
    'threshold-percent': {
      title: '',
      description: 'Percentage reached of the allocated budget that triggers this notification',
    },
    emails: {
      title: '',
      description: 'Emails to send budget threshold notification.',
    },
  },
});

translate(c.BudgetConfigType, {
  title: 'Budget Config',
  description:
    'AWS Budgets gives you the ability to set custom budgets that alert you when your costs or usage exceed (or are forecasted to exceed) your budgeted amount. This setting defines the AWS Budget configuration which will be created in accounts, defined either in `account-configs` or `organizational-units`.',
  fields: {
    name: {
      title: 'Budget Name',
      description: 'Name for the Budget',
    },
    period: {
      title: 'Budget Period',
      description: 'Period in: Daily, Monthly, Quarterly or Annually ',
    },
    amount: {
      title: 'Budget Amount',
      description: 'Amount in USD for the budget',
    },
    include: {
      title: '',
      description:
        'Include advanced options like: Refunds, Credits, Upfront reservation fees, Recurring reservation charges, Taxes, Support charges, Other subscription costs, Use blended costs, Use amortized costs and Discounts',
    },
    alerts: {
      title: 'Budget Alerts',
      description: 'Generate alerts and send notification emails when certain percentages of the amount are reached',
    },
  },
});

translate(c.LimitConfig, {
  title: 'Limit Config',
  description:
    'Automatically request limit increases for the account and prevents the Accelerator from exceeding the limit by not deploying objects until the limit has been confirmed increased.',
  fields: {
    value: {
      title: 'Limit Value',
      description: 'The limit increase that is being requested, for example Amazon VPC/VPCs per Region',
    },
    'customer-confirm-inplace': {
      title: '',
      description:
        'Some quotas once increased when queries do not return the new quota value.  This setting allows the customer to manually tell the Accelerator the quota has been increased.',
    },
  },
});

translate(c.SsmShareAutomation, {
  title: 'SSM Share Automation',
  description:
    'A list of the SSM automation documents defined and created within `global-options` to be *shared* into this account, in addition to any OU level documents shared into this account.  This can be specified at either the `account-configs` or `organizational-units` level.',
  fields: {
    account: {
      title: '',
      description: 'Main account to define the SM configurations',
    },
    regions: {
      title: '',
      description: 'Regions for SSM',
    },
    documents: {
      title: 'SSM Documents',
      description: 'Documents to share',
    },
  },
});

translate(c.AwsConfigRules, {
  title: 'AWS Config Rules',
  description:
    'A list of config rules defined in `global-options` to be deployed in either an account or all accounts in an OU.',
  fields: {
    'excl-regions': {
      title: '',
      description:
        'Used to list non-opt-in regions where AWS Config is not yet available, i.e. a recently launched region',
    },
    rules: {
      title: '',
      description: 'List of AWS Config rules',
    },
    'remediate-regions': {
      title: '',
      description: 'Regions where SSM remediation is applied',
    },
  },
});

translate(c.AwsConfigAccountConfig, {
  title: 'AWS Config Account Config',
  description:
    'A list of config rules to be excluded from deployment to this account, even though specified to be deployed at the OU level.',
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
  title: 'Account Config',
  description:
    'The Account Config object is used to define both workload and manadatory (shared) accounts, and enables customizing each individual account to have its own unique persona.  It is recommended that accounts primarily receive their persona or configuation based on their OU, each accounts persona can be customized within this section. Typically workload accounts have minimum amount of account level customization, wheras shared accounts typically contain high levels of customization based on their unique nature.',
  fields: {
    'gui-perm': {
      title: 'GUI Permission',
      description: 'Set to true to block this field from being edited in the GUI.',
    },
    'account-name': {
      title: '',
      description:
        'The name to be used to create the AWS account.  The name appears in the AWS console, the SSO login screen and other locations end-user will see it.',
    },
    description: {
      title: 'Description',
      description:
        'Description field used in the future GUI, and allows customers to provide a purpose for this account.',
    },
    email: {
      title: '',
      description:
        'The email address associated with this account, it must be unique across all AWS accounts and never before used to open an AWS account.',
    },
    ou: {
      title: 'OU',
      description:
        'The Organizational Unit (OU) this account belongs to, which defines the persona the account assumes. The OU must be defined in the OU section of the config file. Core or shared accounts typically belong to the ‘Security’ or ‘Infrastructure’ OU.  The Accelerator does not support OUs with a / in thier name.',
    },
    'ou-path': {
      title: 'OU Path',
      description:
        'This field is used when an account is located in a nested OU, formatted as follows: `Dev/subou1/subou2`.  OUs can be up to 5 levels deep.',
    },
    'share-mad-from': {
      title: 'Share MAD From',
      description:
        'Shares the Managed Microsoft Active Directory (MAD) from the account specified in this parameter to this account.',
    },
    'enable-s3-public-access': {
      title: '',
      description:
        'By default, the Accelerator blocks S3 Public Access in all accounts. Setting this flag enables S3 public access for this account.',
    },
    iam: {
      title: 'IAM',
      description:
        'Creates the defined IAM users, roles, and policies in this account in addition to the OU defined IAM objects.',
    },
    limits: {
      title: '',
      description:
        'Automatically request limit increases for the account and prevents the Accelerator from exceeding the limit by not deploying objects until the limit has been confirmed increased.',
    },
    certificates: {
      title: '',
      description:
        'Defines certificates to be created or imported into this account, in addition to OU defined certificates.',
    },
    vpc: {
      title: 'VPC',
      description:
        'Defines VPC(s) to be created inside this account. VPCs defined inside accounts are local to that account. For shared VPCs define them inside OUs.',
    },
    deployments: {
      title: '',
      description:
        'This section is used define the deployment configuration for higher level objects like like rsyslog clusters, 3rd party firewalls and management appliances, Transit Gateways, and directory services like MAD and ADCs within an account.  Directory service deployments only supported in mandatory-accounts.',
    },
    alb: {
      title: 'ELB',
      description:
        'Deploys an ELB (ALB and/or GWLB), per the defined configuration, in this account (in addition to any OU defined ELBs).',
    },
    's3-retention': {
      title: 'Account S3 logging bucket retention period',
      description:
        'In certain cases logs are delivered to the local account before being centralized to the central logging bucket (i.e. VPC Flow logs).  This setting determines the retention for the local account copy of the logs in S3.  If not specified the `global-options`default-s3-retention value is utilized.',
    },
    budget: {
      title: '',
      description:
        'AWS Budgets gives you the ability to set custom budgets that alert you when your costs or usage exceed (or are forecasted to exceed) your budgeted amount. This setting defines the AWS Budget configuration which will be created in this account, including budget alerts (overrides OU budgets).',
    },
    'account-warming-required': {
      title: '',
      description:
        'This flag is set to true to force a new AWS account to be initialized, such that future programmatic deployments within the account succeed.  Warming is performed by spinning up a small temporary VPC and EC2 instance in the account and letting it run for ~15 minutes before attempting to programmatically deploy resources.',
    },
    'cwl-retention': {
      title: 'Override CloudWatch Log Retention',
      description:
        'Overrides the default retention period (in days) for CloudWatch Log Groups for this account.  Valid values include: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653.',
    },
    deleted: {
      title: '',
      description: 'Marks the account as Suspended or Deleted.  Internal Use only.',
    },
    'src-filename': {
      title: 'Source Filename',
      description:
        'Source filename with the top-level config for this account. This allows the config file to be split into several files, and enable finding the accounts config file.',
    },
    'exclude-ou-albs': {
      title: 'Exclude OU ALBs',
      description: 'Setting this flag prevents the deployment of the OU defined ALBs in this account.',
    },
    'keep-default-vpc-regions': {
      title: 'Keep Default VPC regions',
      description:
        'The Accelerator deletes default VPCs in every region, this specifies regions where the Accelerator will not delete default VPCs for this specific account.',
    },
    'populate-all-elbs-in-param-store': {
      title: 'Populate all Organization ELBs in local Parameter store',
      description:
        'Populates Parameter Store for the specified account with ALB information from all accounts in the organization. This feature is typically used in a central ingress/egress account.',
    },
    'ssm-automation': {
      title: 'SSM Automation Documents',
      description:
        'A list of the SSM automation documents defined and created within `global-options` to be *shared* into this account, in addition to any OU level documents shared into this account.',
    },
    'ssm-inventory-collection': {
      title: 'SSM Inventory Collection',
      description: 'When true, deploys and configures SSM Inventory Collection.',
    },
    'aws-config': {
      title: 'AWS Config Rules',
      description:
        'A list of config rules to be excluded from deployment to this account, even though specified to be deployed at the OU level.',
    },
    scps: {
      title: 'SCPs',
      description: 'A list of SCPs which were defined in `global-options` and are to be attached to this account.',
    },
    'opt-in-vpcs': {
      title: 'Opt-In VPCs',
      description: 'The names of the Opt-In VPCs, defined in the OU, to opt this account in to.',
    },
    'key-pairs': {
      title: '',
      description: 'Creates an EC2 keypair of the specified name in this account.',
    },
    secrets: {
      title: '',
      description: 'Creates a secret of the specified name and length in Secrets Manager in this account.',
    },
  },
});

translate(c.AccountsConfigType, {
  title: 'Account Configuration',
  description:
    'The Account Config object is used to define both workload and manadatory (shared) accounts, and enables customizing each individual account to have its own unique persona. It is recommended that accounts primarily receive their persona or configuation based on their OU, each accounts persona can be customized within these sections. Typically workload accounts have minimum amount of account level customization, wheras shared accounts typically contain high levels of customization based on their unique nature.',
});

translate(c.OrganizationalUnitConfigType, {
  title: 'Organizational Unit Configuration',
  description:
    'Organizational units allows for the grouping of AWS accounts and provisioning unique personas or configurations to groups of AWS accounts.  In most cases, the majority of a workload accounts persona or configuration will be defined in this section based on the accounts Organizational Unit (OU). A common set of OUs could include: Security, Infrastructure, Sandbox, Dev, Test, Prod, Central. This is where you configure services and features that will be shared or common to the accounts inside the Organizational Unit.',
  fields: {
    'gui-perm': {
      title: 'GUI Permission',
      description: 'Set to true to block this field from being edited in the GUI.',
    },
    type: {
      title: '',
      description:
        'This field is on path to be deprecated.  Set to "mandatory" for the core, Security and Infrastructure OUs, all other OUs set to "ignore".',
    },
    description: {
      title: '',
      description: 'Description field used in the future GUI, and allows customers to provide a purpose for this OU.',
    },
    scps: {
      title: 'SCPs',
      description: 'A list of SCPs which were defined in `global-options` and are to be attached to this OU.',
    },
    'share-mad-from': {
      title: 'Share MAD From',
      description:
        'Shares the Managed Microsoft Active Directory (MAD) from the account specified in this parameter to each account in this OU.',
    },
    certificates: {
      title: '',
      description: 'Defines certificates to be created or imported into every account in the OU.',
    },
    iam: {
      title: 'IAM',
      description: 'Creates the defined IAM users, roles, and policies in every account in the OU.',
    },
    alb: {
      title: 'ELB',
      description: 'Deploys an ELB (ALB and/or GWLB), per the defined configuration, in every account in the OU.',
    },
    vpc: {
      title: 'VPC',
      description:
        'Either: a) defines and creates the VPC(s) that will be shared with every account in the OU, or b) defines and creates the VPC(s) in every account in the OU.',
    },
    'default-budgets': {
      title: '',
      description:
        'AWS Budgets gives you the ability to set custom budgets that alert you when your costs or usage exceed (or are forecasted to exceed) your budgeted amount. This setting defines the AWS Budget configuration which will be created in every account in the OU.',
    },
    'ssm-automation': {
      title: 'SSM Automation Documents',
      description:
        'A list of the SSM automation documents defined and created within `global-options` to be *shared* into every account within this OU.',
    },
    'ssm-inventory-collection': {
      title: 'SSM Inventory Collection',
      description: 'When true, deploys and configures SSM Inventory Collection.',
    },
    'aws-config': {
      title: 'AWS Config Rules',
      description: 'A list of config rules defined in `global-options` to be deployed in every account in this OU.',
    },
  },
});

translate(c.OrganizationalUnitsConfigType, {
  title: 'Organizational Unit Config',
  description:
    'Organizational units allows for the grouping of AWS accounts and provisioning unique personas or configurations to groups of AWS accounts.  In most cases, the majority of a workload accounts persona or configuration will be defined in this section based on the accounts Organizational Unit (OU). A common set of OUs could include: Security, Infrastructure, Sandbox, Dev, Test, Prod, Central. This is where you configure services and features that will be shared or common to the accounts inside the Organizational Unit.',
});

translate(c.GlobalOptionsZonesConfigType, {
  title: 'Deprecated',
  description: 'Deprecated',
  fields: {
    account: {
      title: 'Deprecated',
      description: 'Deprecated',
    },
    'resolver-vpc': {
      title: 'Deprecated',
      description: 'Deprecated',
    },
    names: {
      title: 'Deprecated',
      description: 'Deprecated',
    },
    region: {
      title: 'Deprecated',
      description: 'Deprecated',
    },
  },
});

translate(c.CostAndUsageReportConfigType, {
  title: 'Cost And Usage Report Config',
  description: 'This section enables customers to deploy and configure Cost and Usage Reports for the organization.',
  fields: {
    'additional-schema-elements': {
      title: '',
      description: '',
    },
    compression: {
      title: '',
      description: 'ZIP, GZIP or Parquet compression to use with cost and usage reports saved to S3.',
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
  title: 'Cost And Usage Reports',
  description: 'This section enables customers to deploy and configure Cost and Usage Reports for the organization.',
  fields: {
    'cost-and-usage-report': {
      title: '',
      description: 'Please click down to the next level - CostAndUsageReportConfig.',
    },
  },
});

translate(c.SecurityHubFrameworksConfigType, {
  title: 'SecurityHub Frameworks Config',
  description:
    'Defines the Security Hub frameworks to be deployed to all accounts in the organization and any individual controls within the frameworks to be disabled.',
  fields: {
    standards: {
      title: '',
      description:
        'Security Hub provides controls for the following standards.: CIS AWS Foundations: Payment Card Industry Data Security Standard (PCI DSS) and AWS Foundational Security Best Practices',
    },
  },
});

translate(c.IamAccountPasswordPolicyType, {
  title: 'IAM Password Policy',
  description:
    'This group of settings enables setting the AWS IAM password policies for all accounts in the organization.',
  fields: {
    'allow-users-to-change-password': {
      title: '',
      description: 'You can permit all IAM users in your account to use the IAM console to change their own passwords',
    },
    'hard-expiry': {
      title: '',
      description:
        'Prevents IAM users from setting a new password after their password has expired. The IAM user cannot be accessed until an administrator resets the password',
    },
    'require-uppercase-characters': {
      title: '',
      description: 'Require at least one uppercase letter from Latin alphabet (A–Z)',
    },
    'require-lowercase-characters': {
      title: '',
      description: 'Require at least one lowercase letter from Latin alphabet (a–z)',
    },
    'require-symbols': {
      title: '',
      description: 'Require at least one nonalphanumeric character ! @ # $ % ^ & * ( ) _ + - = [ ] { } | ',
    },
    'require-numbers': {
      title: '',
      description: 'Require at least one number',
    },
    'minimum-password-length': {
      title: '',
      description: 'You can specify a minimum of 6 characters and a maximum of 128 characters. ',
    },
    'password-reuse-prevention': {
      title: '',
      description:
        " You can prevent IAM users from reusing a specified number of previous passwords. You can specify a minimum number of 1 and a maximum number of 24 previous passwords that can't be repeated. ",
    },
    'max-password-age': {
      title: '',
      description: 'The number of days that an IAM user password is valid',
    },
  },
});

translate(c.CwlExclusions, {
  title: 'CloudWatch Log Exclusions',
  description:
    'Excludes log groups matching the specified patterns, in the specified account, from being forwarded to the central-log-services bucket.  Multiple account/Log group combinations can be provided.',
  fields: {
    account: {
      title: '',
      description: 'Account name.',
    },
    exclusions: {
      title: '',
      description: 'Log group patterns to exclude (i.e. def/*).',
    },
  },
});

translate(c.S3LogPartitionType, {
  title: 'S3 Log Partition Mapping',
  description: 'Maps CloudWatch Log Groups to S3 prefixes.',
  fields: {
    logGroupPattern: {
      title: 'Log Group Pattern',
      description: 'Used to match a log group.',
    },
    s3Prefix: {
      title: 'S3 Prefix',
      description:
        'CloudWatch log entries that match the logGroupPattern will be extracted and placed into a S3 prefix specified by this value.',
    },
  },
});

translate(c.CentralServicesConfigType, {
  title: 'Centralized Security Services Config',
  description:
    'The Accelerator has the concept of grouping certain sets of functionality (security, logs, ITOps, Management) together and centralizing their respective capabilities into a single account.  This section identifies the respective central account and provides the ability to enable/disable services associated with it which are applicable across the organization.  The central account will be defined in the `mandatory-account-configs` section of the config file.  The respective Organization wide central Services will be defined in this section, either `aws-org-managment`, `central-log-services`, `central-operations-services`, or `central-security-services`.  Not all options are available in each of these four sections of the config file.',
  fields: {
    account: {
      title: '',
      description: 'The name of the AWS Account, as defined in this config, to enable centralized services. [ALL]',
    },
    region: {
      title: '',
      description:
        'The region to designate as the `home` region for central services. When possible, the functionality of the centralized service will be consolidated by to this single region.  The region which contains the centralized log-archive bucket and the region that security tooling admin functionality will be centralized to(when possible). [ALL]',
    },
    'security-hub': {
      title: '',
      description:
        'Enables Security Hub in all accounts and regions and sets the Security Hub Administrator account to central security account. Default to false.[SECURITY]',
    },
    'security-hub-excl-regions': {
      title: 'Security Hub Exclusion Regions',
      description: 'A list of regions to exclude from Security Hub being enabled. [SECURITY]',
    },
    guardduty: {
      title: 'GuardDuty',
      description:
        'Enables Guardduty in all accounts and regions and sets the Guardduty Administrator account to central security account. Default to false. [SECURITY]',
    },
    'guardduty-excl-regions': {
      title: 'GuardDuty Exclusion Regions',
      description: 'List of excluded regions from Guardduty protection. [SECURITY]',
    },
    'guardduty-s3': {
      title: 'GuardDuty S3 Protection',
      description:
        'S3 protection enables Amazon GuardDuty to monitor object-level API operations to identify potential security risks for data within your S3 buckets. [SECURITY]',
    },
    'guardduty-s3-excl-regions': {
      title: 'GuardDuty S3 Protection Exclusion Regions',
      description: 'List of excluded regions from Guardduty S3 protection. [SECURITY]',
    },
    'access-analyzer': {
      title: '',
      description:
        'Enables AWS Access Analyzer in all accounts and regions and sets the Access Analyzer Administrator account to the central security account. Default to false. [SECURITY]',
    },
    cwl: {
      title: 'CloudWatch Logs Access',
      description:
        'Enables users in the specified account (central security account/central operations account) to access the CloudWatch Logs of all accounts in the Organization. [SECURITY][OPS]',
    },
    'cwl-access-level': {
      title: 'CloudWatch Logs Access Level',
      description:
        'Supported values are: `full` (CloudWatchReadOnlyAccess, CloudWatchAutomaticDashboardsAccess, job-function/ViewOnlyAccess, AWESXrayReadOnlyAccess), `cwl+auto+xray` (CloudWatchReadOnlyAccess, CloudWatchAutomaticDashboardsAccess, AWESXrayReadOnlyAccess), and `cwl+auto` (CloudWatchReadOnlyAccess, CloudWatchAutomaticDashboardsAccess). [SECURITY][OPS]',
    },
    'cwl-glbl-exclusions': {
      title: 'CloudWatch Logs Global Exclusions',
      description:
        'Excludes log groups matching the pattern in any account from being forwarded to the central-log-services bucket. Wildcards supported. For example /xxx/yyy/*. [LOGS]',
    },
    'ssm-to-s3': {
      title: 'Session Manager logging to S3 central bucket.',
      description:
        'Set to true to configure and send Session Manager session logs to the central-log-services bucket. [LOGS]',
    },
    'ssm-to-cwl': {
      title: 'Session Manager logging to CloudWatch Logs',
      description: 'Set to true to configure and send Session Manager session logs to CloudWatch Logs. [LOGS]',
    },
    'cwl-exclusions': {
      title: 'CloudWatch Logs Exclusions',
      description:
        'Excludes log groups matching the specified pattern, in the specified account, from being forwarded to the central-log-services bucket. [LOGS]',
    },
    'kinesis-stream-shard-count': {
      title: '',
      description:
        'The Kinesis Data Stream shard count used for CloudWatch Log centralization.  This needs to be manually scaled as a customers environment grows to ensure all logs are centralized. [LOGS]',
    },
    macie: {
      title: '',
      description:
        'Enables Macie in all accounts and regions and sets the Macie Administrator account to the central security account. Default to false. [SECURITY]',
    },
    'macie-excl-regions': {
      title: 'Macie Exclusion Regions',
      description: 'A list of regions to exclude from being Macie enabled. [SECURITY]',
    },
    'macie-frequency': {
      title: 'Update Frequency for Policy Findings',
      description:
        'The schedule Macie uses to publish updates to policy findings. Supported values are: FIFTEEN_MINUTES, ONE_HOUR, SIX_HOURS. [SECURITY]',
    },
    'config-excl-regions': {
      title: 'Config Exclusion Regions',
      description: 'A list of regions to exclude from enabling a Config Recorder. [SECURITY]',
    },
    'config-aggr-excl-regions': {
      title: 'Deprecated',
      description: 'Deprecated',
    },
    'sns-excl-regions': {
      title: 'SNS Exclusion Regions',
      description: 'A list of regions to exclude from deploying SNS topics and the SNS Subscription Lambda. [LOG]',
    },
    'sns-subscription-emails': {
      title: 'SNS Subscription Emails',
      description:
        'Email addresses to forward all alerts and alarms categorized by priority.  Required topics include: High, Medium, Low, Ignore. [LOG]',
    },
    's3-retention': {
      title: 'Central S3 logging bucket retention period',
      description:
        'Specifies the retention period  for logs stored in the central logging buckets, in days.  After this time these logs are permenently deleted. [LOG]',
    },
    'add-sns-topics': {
      title: 'Add SNS Topics',
      description:
        'Adds a local SNS topic in the specified account due to challenges with cross-account topics. [OPS][MGMT]',
    },
    'fw-mgr-alert-level': {
      title: 'Firewall Manager Alert Level',
      description:
        'Determines which of the three security notification email priority levels to subscribe all Firewall Manager alerts. [SECURITY]',
    },
    'macie-sensitive-sh': {
      title: 'Send Macie sensitive findings to Security Hub',
      description: 'Publish Macie sensitive data findings to Security Hub. [SECURITY]',
    },
    'security-hub-findings-sns': {
      title: 'Send Security Hub Findings to SNS',
      description:
        'Send all Security Hub findings ABOVE this severity level to the appropriate security notification topic.  Values: Low, Medium, High, Critical, None. [SECURITY]',
    },
    'config-aggr': {
      title: 'AWS Config Aggregator',
      description: 'Configures the AWS Account with an AWS Config Aggregator. [ALL]',
    },
    'dynamic-s3-log-partitioning': {
      title: 'Dynamic S3 Log Partitioning',
      description: 'Configures CWLogs to be extracted and placed into different S3 prefixes from Firehose.',
    },
  },
});

translate(c.ScpsConfigType, {
  title: 'Service Control Policies',
  description:
    'This section within `global-options` is used to *define* AWS Service Control Policies (SCPs).  Defined SCPs are referenced in the `organizational-units` or `account-configs` sections, which  assigns these SCPs for application.',
  fields: {
    name: {
      title: 'Policy Name',
      description: 'Name of Service Control Policy (SCP)',
    },
    description: {
      title: 'Policy Description',
      description: 'Description of SCP',
    },
    policy: {
      title: 'Policy filename',
      description: 'JSON file containing the SCP configuration',
    },
  },
});

translate(c.FlowLogsFilterTypes, {
  title: 'Flow Log Filter Types',
  description:
    'For filter, specify the type of traffic to log. Choose all to log accepted and rejected traffic, reject to log only rejected traffic, or accept to log only accepted traffic',
  enumLabels: {
    ACCEPT: 'Accept',
    REJECT: 'Reject',
    ALL: 'All',
  },
});

translate(c.FlowLogsIntervalTypes, {
  title: 'VPC Flow Log Interval',
  description: 'Must be either: 60 or 600 (i.e. 1 or 10 minutes)',
});

translate(c.VpcFlowLogsConfigType, {
  title: 'VPC Flow Log Config',
  description:
    'This section within `global-options` is used to define a consistent set of VPC Flog Log settings, which will be utilized when VPC Flow logging is enabled on a VPC within either an organizational units or a specific account.',
  fields: {
    filter: {
      title: '',
      description:
        'For filter, specify the type of traffic to log. Choose all to log accepted and rejected traffic, reject to log only rejected traffic, or accept to log only accepted traffic',
    },
    interval: {
      title: '',
      description: 'Aggregation interval in seconds',
    },
    'default-format': {
      title: '',
      description:
        'With the default format, the flow log records include only certain fields. You cannot customize or change the default format. To capture additional fields or a different subset of fields, specify a custom format instead. ',
    },
    'custom-fields': {
      title: '',
      description:
        'With a custom format, you specify which fields are included in the flow log records and in which order. This enables you to create flow logs that are specific to your needs and to omit fields that are not relevant. Using a custom format can reduce the need for separate processes to extract specific information from the published flow logs. You can specify any number of the available flow log fields, but you must specify at least one',
    },
  },
});

translate(c.AdditionalCwlRegionType, {
  title: 'Additional CloudWatch Log Regions',
  description:
    'By default, only CloudWatch Logs from the Accelerator home region are centralized into the central S3 logging bucket, this allows centralizing CloudWatch Logs for additional regions. Each region requires an entry in the format: "us-east-1": { "kinesis-stream-shard-count": 1 }.',
  fields: {
    'kinesis-stream-shard-count': {
      title: '',
      description:
        'An integer representing the number of Kinesis shards.  You can only increase/reduce by half the current limit (i.e. you can change from 1-2, 2-3, 4-6). ',
    },
  },
});

translate(c.CloudWatchMetricFiltersConfigType, {
  title: 'CloudWatch Metric Definitions',
  description:
    'This section is used to define each CloudWatch Metric.  CloudWatch Metrics are data about the performance of your systems which can be used to trigger a CloudWatch Alarm.',
  fields: {
    'filter-name': {
      title: '',
      description:
        'You can use metric filters to search for and match terms, phrases, or values in your log events. When a metric filter finds one of the terms, phrases, or values in your log events, you can increment the value of a CloudWatch metric. For example, you can create a metric filter to search for and count the occurrence of the word ERROR in your log events. ',
    },
    accounts: {
      title: '',
      description: 'List of accounts to create the CW metric in, usually the management account',
    },
    regions: {
      title: '',
      description: 'Currently only the Accelerator home region is supported.',
    },
    'loggroup-name': {
      title: '',
      description: 'Name of the log group',
    },
    'filter-pattern': {
      title: '',
      description: 'Filter pattern',
    },
    'metric-namespace': {
      title: '',
      description: 'CW metric namespace',
    },
    'metric-name': {
      title: '',
      description: 'Metric name',
    },
    'metric-value': {
      title: '',
      description: 'Metric value',
    },
    'default-value': {
      title: '',
      description: 'Default value VERIFY why this is not used int the sample file',
    },
  },
});

translate(c.CloudWatchAlarmDefinitionConfigType, {
  title: 'CloudWatch Alarm Definitions',
  description:
    'This section is used to define each CloudWatch Alarm.  If a value is provided as a CloudWatch alarm default it does not need to be specified, unless being overriden.',
  fields: {
    accounts: {
      title: '',
      description:
        'Account(s) where the CloudWatch Alarms is to be deployed.  Specify ALL to target all accounts in the Organization.',
    },
    regions: {
      title: '',
      description: 'Currently only the Accelerator home region is supported.',
    },
    namespace: {
      title: '',
      description: 'A namespace is a container for CloudWatch metrics.',
    },
    statistic: {
      title: '',
      description: 'Statistics are metric data aggregations over specified periods of time.',
    },
    period: {
      title: '',
      description: 'A period is the length of time associated with a specific Amazon CloudWatch statistic.',
    },
    'threshold-type': {
      title: '',
      description: 'Static to use a value as a threshold or Anomaly Detection to use a band as a threshold.',
    },
    'comparison-operator': {
      title: '',
      description:
        'Comparison and logical operators with either a pair of time series or a pair of single scalar values.',
    },
    threshold: {
      title: '',
      description:
        'Static threshold type define a threshold value. Anomaly Detection Threshold type threshold Based on a standard deviation. Higher number means thicker band, lower number means thinner band. Must be a positive number.',
    },
    'evaluation-periods': {
      title: '',
      description:
        'Define the number of datapoints within the evaluation period that must be breaching to cause the alarm to go to ALARM state.',
    },
    'treat-missing-data': {
      title: '',
      description: 'How to treat missing data when evaluating the alarm.',
    },
    'alarm-name': {
      title: '',
      description: 'Custom name of the alarm without spaces.',
    },
    'metric-name': {
      title: '',
      description: 'The resource metric name to base the alarm on.',
    },
    'sns-alert-level': {
      title: '',
      description: 'Define the alarm state that will trigger this action.',
    },
    'alarm-description': {
      title: '',
      description: 'Alarm description to provide context about the alarm up to 1024 characters.',
    },
    'in-org-mgmt-use-lcl-sns': {
      title: '',
      description: '',
    },
  },
});

translate(c.CloudWatchAlarmsConfigType, {
  title: 'CloudWatch Alarm Defaults and Definitions',
  description:
    'This section is used to define the default values for all defined CloudWatch Alarms, to define the specific alarms and override any defaults when specified on an individual alarm definition.',
  fields: {
    'default-accounts': {
      title: '',
      description:
        'Account(s) where all CloudWatch Alarms are to be deployed, unless a different account list is specified on the rule.  Specify ALL to target all accounts in the Organization.',
    },
    'default-regions': {
      title: '',
      description: 'Currently only the Accelerator home region is supported.',
    },
    'default-namespace': {
      title: '',
      description:
        'A namespace is a container for CloudWatch metrics. Metrics in different namespaces are isolated from each other, so that metrics from different applications are not mistakenly aggregated into the same statistics',
    },
    'default-statistic': {
      title: '',
      description:
        'Statistics are metric data aggregations over specified periods of time. CloudWatch provides statistics based on the metric data points provided by your custom data or provided by other AWS services to CloudWatch',
    },
    'default-period': {
      title: '',
      description:
        'Period is the length of time to evaluate the metric or expression to create each individual data point for an alarm. It is expressed in seconds. If you choose one minute as the period, the alarm evaluates the metric once per minute',
    },
    'default-threshold-type': {
      title: '',
      description: 'Static to use a value a a threshold',
    },
    'default-comparison-operator': {
      title: '',
      description:
        'The arithmetic operation to use when comparing the specified statistic and threshold. The specified statistic value is used as the first operand. Valid Values: GreaterThanOrEqualToThreshold | GreaterThanThreshold | LessThanThreshold | LessThanOrEqualToThreshold | LessThanLowerOrGreaterThanUpperThreshold | LessThanLowerThreshold | GreaterThanUpperThreshold ',
    },
    'default-threshold': {
      title: '',
      description: 'The value to compare the metric value against',
    },
    'default-evaluation-periods': {
      title: '',
      description: 'The number of the most recent periods, or data points, to evaluate when determining alarm state',
    },
    'default-treat-missing-data': {
      title: '',
      description:
        'Similar to how each alarm is always in one of three states, each specific data point reported to CloudWatch falls under one of three categories: Not breaching (within the threshold), Breaching (violating the threshold), Missing',
    },
    'default-in-org-mgmt-use-lcl-sns': {
      title: 'Default in Org Mgmt account use local SNS',
      description:
        'By default, cross-account SNS topics in the central-log-services account are leveraged, this overides this setting in the Org Management account to use local topics as the default for all rules.',
    },
    definitions: {
      title: '',
      description: 'This section defines the list of CloudWatch alarms to be deployed.',
    },
  },
});

translate(c.SsmDocument, {
  title: 'SSM Documents',
  description:
    'An AWS Systems Manager document (SSM document) defines the actions that Systems Manager performs on your managed elements. Documents use JavaScript Object Notation (JSON) or YAML, and they include steps and parameters that you specify',
  fields: {
    name: {
      title: '',
      description: 'Name of the document',
    },
    description: {
      title: '',
      description: 'Description of the document',
    },
    template: {
      title: '',
      description: 'Name of the template file for the document',
    },
  },
});
translate(c.SsmAutomation, {
  title: 'SSM Automation',
  description:
    'This section within `global-options` is used to *defined* and *deploy* SSM automation documents into a limited number of central accounts.  These Automation documents are then shared into accounts within designated organizational units or to specific accounts based on settings at the organizational-unit or account level. SSM Automation documents can be invoked from AWS Config rules to remediate non-compliant rules.',
  fields: {
    accounts: {
      title: '',
      description: 'Name of the account where the SSM automation documents are defined ',
    },
    regions: {
      title: '',
      description: 'Region for SSM',
    },
    documents: {
      title: 'SSM Documents',
      description: 'Documents to apply to the account',
    },
  },
});

translate(c.AwsConfigRuleDefaults, {
  title: 'AWS Config Rule Defaults',
  description: 'Default values for Config rules, these can be over-ridden by providing a specific value in each rule',
  fields: {
    remediation: {
      title: '',
      description: 'Attempt a remediation action when the rule is triggered',
    },
    'remediation-attempts': {
      title: '',
      description: 'Number of attempts for remediation',
    },
    'remediation-retry-seconds': {
      title: '',
      description: 'Number of seconds between remediation attempts',
    },
    'remediation-concurrency': {
      title: '',
      description:
        'Concurrency is the number of requests that your function is serving at any given time. When your function is invoked, Lambda allocates an instance of it to process the event. When the function code finishes running, it can handle another request. If the function is invoked again while a request is still being processed, another instance is allocated, which increases the function concurrency',
    },
  },
});

translate(c.AwsConfigRule, {
  title: 'AWS Config Rules',
  description: 'AWS Config Rule definition',
  fields: {
    name: {
      title: '',
      description: 'Name of the rule',
    },
    remediation: {
      title: '',
      description: 'Attempt remediation',
    },
    'remediation-attempts': {
      title: '',
      description: 'Number of attempts for remediation',
    },
    'remediation-retry-seconds': {
      title: '',
      description: 'Number of seconds between remediation attempts',
    },
    'remediation-concurrency': {
      title: '',
      description: 'Lambda concurrency',
    },
    'remediation-action': {
      title: '',
      description: 'Name of the SSM automation document to invoke for remediation',
    },
    'remediation-params': {
      title: '',
      description: 'Parameters sent to SSM remediation action',
    },
    parameters: {
      title: '',
      description: 'Parameters passed to the rule Lambda function',
    },
    type: {
      title: '',
      description: 'Set to "custom" for custom rules, leave empty for managed rules',
    },
    'max-frequency': {
      title: '',
      description: 'Maximum frequency',
    },
    'resource-types': {
      title: '',
      description: 'Resource type to be monitored by a custom Config rule',
    },
    runtime: {
      title: '',
      description: 'Runtime for the Lambda function code of a custom Config rule',
    },
    'runtime-path': {
      title: '',
      description:
        'For each Lambda runtime, the PATH variable includes specific folders in the /opt directory. If you define the same folder structure in your layer .zip file archive, your function code can access the layer content without the need to specify the path',
    },
  },
});

translate(c.AwsConfig, {
  title: 'AWS Config',
  description:
    'This section within `global-options` is used to *define* AWS Config rules.  These rules are deployed into accounts within designated organizational units or to specific accounts based on settings at the organizational-unit or account level. AWS Config rules continuously evaluate the configuration settings of your AWS resources and when AWS Config detects that a resource violates the conditions in your rule(s), it flags the resource as noncompliant.',
  fields: {
    defaults: {
      title: '',
      description: 'Default parameters that apply to every Config rule',
    },
    rules: {
      title: 'Config Rules',
      description: 'List of Config rules',
    },
  },
});

translate(c.GlobalOptionsConfigType, {
  title: 'Global Options',
  description:
    'This section defines parameters or configurations that apply across the entire Accelerator installation.',
  fields: {
    'ct-baseline': {
      title: 'ControlTower Baseline',
      description:
        'Indicates this installation depends on Control Tower and Control Tower deployed functionality. Control Tower must be installed before beginning an Accelerator installation.  Upgrades from a standalone install to a Control Tower based install are not currently possible.  This flag cannot be changed after initial installation.',
    },
    'meta-data-collection': {
      title: 'Metadata Collection',
      description:
        'Enables metadata collection service that stores information about ASEA configuration in the metadata bucket in the log archive account.',
    },
    'default-s3-retention': {
      title: 'Default account S3 logging bucket retention period',
      description:
        'In certain cases logs are delivered to the local account before being centralized to the central logging bucket (i.e. VPC Flow logs).  This setting determines the default retention for the local account copy of the logs in S3.',
    },
    'central-bucket': {
      title: 'Customer S3 Input Bucket',
      description:
        'The S3 bucket used by customers to provide a customers customized configuration files, including the config.json file.  These files are used by the Accelerator to defined the deployed architecture and configuration or override default. During deployment, the core configuration file is copied to CodeCommit and customers must make configuration changes in CodeCommit after the initial install.',
    },
    reports: {
      title: 'Cost and Usage Reports',
      description:
        'This section enables customers to deploy and configure Cost and Usage Reports for the organization.',
    },
    'security-hub-frameworks': {
      title: '',
      description:
        'Defines the Security Hub frameworks to be deployed to all accounts in the organization and any individual controls within the frameworks to be disabled.',
    },
    'central-security-services': {
      title: '',
      description:
        'The Accelerator has the concept of grouping certain sets of functionality (security, logs, ITOps, Management) together and centralizing their respective capabilities into a single account.  This section identifies the Security Tooling account and provides the ability to enable/disable services associated with it which are applicable across the organization.  The Security Tooling account will be defined in the `mandatory-account-configs` section of the config file.  Organization wide Security Services will be defined here.',
    },
    'central-operations-services': {
      title: '',
      description:
        'The Accelerator has the concept of grouping certain sets of functionality (security, logs, ITOps, Management) together and centralizing their respective capabilities into a single account.  This section identifies the Operations account and provides the ability to enable/disable services associated with it which are applicable across the organization.  The Operations account will be defined in the `mandatory-account-configs` section of the config file.  Organization wide Operations Services will be defined here.',
    },
    'central-log-services': {
      title: '',
      description:
        'The Accelerator has the concept of grouping certain sets of functionality (security, logs, ITOps, Management) together and centralizing their respective capabilities into a single account.  This section identifies the Logging account and provides the ability to enable/disable services associated with it which are applicable across the organization.  The Logging account will be defined in the `mandatory-account-configs` section of the config file.  Organization wide Logging Services will be defined here.',
    },
    'aws-org-management': {
      title: 'AWS Organizational Management Account',
      description:
        'The Accelerator has the concept of grouping certain sets of functionality (security, logs, ITOps, Management) together and centralizing their respective capabilities into a single account.  This section identifies the Organization management account and provides the ability to enable/disable services associated with it which are applicable across the organization.  The Organization management account will be defined in the `mandatory-account-configs` section of the config file.',
    },
    scps: {
      title: 'SCPs',
      description:
        'This section within `global-options` is used to *define* AWS Service Control Policies (SCPs).  Defined SCPs are referenced in the `organizational-units` or `account-configs` sections, which  assigns these SCPs for application.',
    },
    'organization-admin-role': {
      title: 'Organization Admin Role',
      description:
        'The initial default role that exists in every new AWS account and will be used by Accelerator and Control Tower when creating new accounts.  Must be specified by customers when creating new AWS accounts through AWS Organizations.  This must be set to AWSControlTowerExecution when ct-baseline is set to true.',
    },
    'supported-regions': {
      title: 'Accelerator Managed Regions',
      description:
        'This is the list of regions where security and governance controls will be deployed by default. It is recommended this list include all enabled by default regions, but, this list MUST include the Accelerator home region, us-east-1 and any regions where the Accelerator deploys functionality like VPCs, TGWs, Zones or Automation documents.',
    },
    'keep-default-vpc-regions': {
      title: 'Keep Default VPC Regions',
      description:
        'The Accelerator deletes default VPCs in every region, this specifies regions where the Accelerator will not delete default VPCs across all accounts in the Organization.  This can also be specified at the account level.',
    },
    'iam-password-policies': {
      title: 'IAM Password Policies',
      description:
        'This group of settings enables setting the AWS IAM password policies for all accounts in the organization.',
    },
    'default-cwl-retention': {
      title: 'CloudWatch Logs Retention Period',
      description:
        'Defines the default retention period for CloudWatch Log Groups in all Accelerator managed accounts, in days.  Valid values include: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653.',
    },
    'ignored-ous': {
      title: 'Ignored OUs',
      description:
        'Accounts placed within any OU defined here fall outside the governance structure of the Accelerator and do not need to be listed in the config file.  The Accelerator does not apply guardrails to accounts within this OU.',
    },
    'install-cloudformation-master-role': {
      title: 'Install Cloudformation Management Role',
      description:
        'This flag enables disabling the creation of the CloudFormation role in the Organization management account. Only required when repurposing an old sub-account as a new Organization management account.',
    },
    'workloadaccounts-prefix': {
      title: 'Workload Accounts Config Filename Prefix',
      description:
        'When the config file reaches a certain size (line count), the Accelerator will place all new workload accounts in a new config file.  This is the prefix to be used for any new filenames (i.e. config).',
    },
    'workloadaccounts-suffix': {
      title: 'Workload Accounts Config Filename Suffix',
      description:
        'When the config file reaches a certain size (line count), the Accelerator will place all new workload accounts in a new config file.  This is the suffix to be used for the NEXT new filename (any integer), after assigned, it is incremented by 1.',
    },
    'workloadaccounts-param-filename': {
      title: 'Workload Accounts Parameter Filename',
      description:
        'This is the filename of the main configuration file which contains all the top-level config sections (i.e. config.json).  As the config file can be broken into multiple parts, this enables finding the top-level file and all other sub-files.',
    },
    'vpc-flow-logs': {
      title: 'VPC Flow Logs',
      description:
        'This section within `global-options` is used to define a consistent set of VPC Flog Log settings, which will be utilized when VPC Flow logging is enabled on a VPC within either `organizational-units` or `account-configs`.',
    },
    'additional-cwl-regions': {
      title: 'Additional CloudWatch Log Regions',
      description:
        'By default, only CloudWatch Logs from the Accelerator home region are centralized into the central S3 logging bucket, this allows centralizing CloudWatch Logs for additional regions.  Each region requires an entry in the format: "us-east-1": { "kinesis-stream-shard-count": 1 }.',
    },
    'additional-global-output-regions': {
      title: '',
      description:
        'By default, Parameter Store is only populated with parameters for Accelerator deployed objects in the Accelerator home region, this allows for populating Parameter Store in additional regions.',
    },
    cloudwatch: {
      title: 'CloudWatch',
      description:
        'This section is used to *define* and *deploy* CloudWatch metrics and alarms.  These metrics and alarms can be installed in a list of named accounts, or to all accounts in the organization within this ssection.  CloudWatch metrics and alarms are currently only supported in the Accelerator home region.',
    },
    'ssm-automation': {
      title: 'SSM Automation',
      description:
        'This section within `global-options` is used to *defined* and *deploy* SSM automation documents into a limited number of central accounts.  These Automation documents are then shared into accounts within designated organizational units or to specific accounts based on settings at the organizational-unit or account level. SSM Automation documents can be invoked from AWS Config rules to remediate non-compliant rules.',
    },
    'aws-config': {
      title: 'AWS Config',
      description:
        'This section within `global-options` is used to *define* AWS Config rules.  These rules are deployed into accounts within designated organizational units or to specific accounts based on settings at the organizational-unit or account level. AWS Config rules continuously evaluate the configuration settings of your AWS resources and when AWS Config detects that a resource violates the conditions in your rule(s), it flags the resource as noncompliant.',
    },
    'default-ssm-documents': {
      title: 'Deprecated',
      description: 'Deprecated',
    },
    'cidr-pools': {
      title: 'CIDR Pools',
      description:
        'CIDR Pools are used to enable the automatic allocation of IP addresses to VPCs and Subnets.  Multiple named pools can be created which can each contain multiple CIDR blocks, each assigned to a specific region.',
    },
    'control-tower-supported-regions': {
      title: '',
      description:
        'This field needs to be populated with the list of regions both supported and enabled by Control Tower. As customers enable new regions, including when new regions are supported by Control Tower, they need to be added to this list.',
    },
    'endpoint-port-overrides': {
      title: '',
      description:
        'The Accelerator locked down all interface endpoint security groups to 0.0.0.0/0:443 inbound, no outbound-rules.  As certain endpoints a different set of ports, this setting enables customers to overide the defaults for a specific endpoint.  If a customer needs to lockdown an endpoint to a specific CIDR range, that is set at the VPC level.  Example: "endpoint-port-overrides": {"logs": ["TCP:443", "UDP:9418"], "ssmmessages": ["TCP:443", "TCP:8080"] }',
    },
    'separate-s3-dp-org-trail': {
      title: 'Seperate S3 DataPlane Organization Tail',
      description:
        'Added to enable Control Tower support, as the Control Tower CloudTrails do not include data plane logging. This allows for the creation of a second trail only containing Data Plane events.',
    },
  },
});

translate(c.AcceleratorConfigType, {
  title: 'Accelerator Configuration',
  description:
    'This is the top level object of the Accelerator Config file, which defines and breaks the configuration up into four major sections. Organization wide settings (`global-options`), a section to enable providing a unique persona to groups or collections of AWS accounts (`organizational-units`), and two sections to define configurations that need to be unique to a particular AWS account, one for common or shared infrastructure accounts (`mandatory-account-configs`) and another for tenant or workload accounts (`workload-account-configs`).  One more section exists to ease working with these other sections (`replacements`).',
  fields: {
    replacements: {
      title: '',
      description:
        'This section allows for the definition of variables with assigned values, which can then be referenced throughout the main config file, SCPs, or Firewall configs. Variables can be updated to reflect a customers requirements in a single spot, instead of requiring multiple updates throughout the customers configuration file(s).',
    },
    'global-options': {
      title: '',
      description:
        'This section defines parameters or configurations that apply across the entire Accelerator installation.',
    },
    'mandatory-account-configs': {
      title: 'Shared Accounts',
      description:
        'AWS accounts which contain components leveraged or utilized by other AWS accounts within the organization must be defined here.  These are AWS accounts which are used to provide centralized functionality across the entire organization. For example: Log Archive, Security Tooling, Core Networking, etc. While workload accounts typically have a minimum amount of account level customization, the shared accounts typically contain a high level of customization.',
    },
    'workload-account-configs': {
      title: 'Workload Accounts',
      description:
        'AWS accounts which contain a customers workloads and applications are defined within this section.  It is recommended that accounts primarily receive their configuation based on the persona or OU defined configuration, but each accounts persona can be customized within this section.',
    },
    'organizational-units': {
      title: '',
      description:
        'Organizational units allows for the grouping of AWS accounts and provisioning unique personas or configurations to groups of AWS accounts.  In most cases, the majority of a workload accounts persona or configuration will be defined in this section based on the accounts Organizational Unit (OU). A common set of OUs could include: Security, Infrastructure, Sandbox, Dev, Test, Prod, Central. This is where you configure services and features that will be shared or common to the accounts inside the Organizational Unit.',
    },
  },
});

export default translations;
