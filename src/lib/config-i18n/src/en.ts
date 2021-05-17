import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { translation } from './translations';

const translations = translation('en', {
  menu: {
    accelerator_configuration: 'Accelerator Configuration',
    properties: 'Properties',
    graphical_editor: 'Graphical Editor',
    code_editor: 'Code Editor',
    wizards: 'Wizards',
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
    add: 'Add',
    cancel: 'Cancel',
    remove: 'Remove',
    save: 'Save',
    choose: 'Choose',
    export: 'Export',
    choose_file: 'Choose file',
    edit: 'Edit',
    import: 'Import',
  },
  labels: {
    empty: '<empty>',
    codecommit_repository: 'CodeCommit Repository Name',
    codecommit_repository_description: 'The name of the CodeCommit repository that contains the configuration file.',
    codecommit_branch: 'CodeCommit Branch',
    codecommit_branch_description: 'The name of the branch in the CodeCommit repository.',
    codecommit_file: 'CodeCommit File Path',
    codecommit_file_description: 'The name of the configuration file in the CodeCommit repository.',
    export_as_file: 'Export the configuration as a file and download it with your browser.',
    export_introduction:
      'You can download the configuration as a file or save it as a file in a CodeCommit repository.',
    configuration_is_valid: 'The configuration is valid.',
    array_element: 'Element at index "{{index}}"',
    required: 'Required',
    toggle_replacement: 'Toggle Replacement',
    loading: 'Loading...',
    selected_configuration_is_valid: 'The selected configuration file is valid.',
    import_with_errors: 'Import with errors',
    import_with_errors_description: 'The file will be imported even though there are errors.',
    import_configuration_introduction:
      'You can import configuration by uploading a file or choosing a file in CodeCommit.',
    configuration_file: 'Configuration File',
    configuration_file_description: 'Upload a configuration file',
    configuration_file_constraint: 'JSON formatted file',
    choose_language: 'Choose language',
  },
  languages: {
    en: 'English',
    fr: 'Français',
  },
});

const translate = translations.add.bind(translations);

translate(t.cidr, {
  title: 'CIDR',
});

translate(c.asn, {
  title: 'ASN',
  errorMessage: 'Value should be between 0 and 65,535.',
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
  },
});

translate(c.AlbTargetInstanceFirewallConfigType, {
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

translate(c.AlbTargetConfigType, {
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
  title: 'Account Configuration',
  description: '',
  fields: {
    'landing-zone-account-type': {
      title: '',
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
  },
});

translate(c.AccountsConfigType, {
  title: 'Account Configuration',
  description: '',
});

translate(c.OrganizationalUnitConfigType, {
  title: '',
  description: '',
  fields: {
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
  title: '',
  description: '',
  fields: {
    'ct-baseline': {
      title: 'Control Tower Baseline',
      description: 'For future integration with Control Tower.',
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
  title: 'Accelerator Configuration',
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
