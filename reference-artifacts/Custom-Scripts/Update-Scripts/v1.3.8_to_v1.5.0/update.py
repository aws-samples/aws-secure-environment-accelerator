import boto3
import json
import argparse
import copy
import ipaddress

from typing import Union

parser = argparse.ArgumentParser(
    description="A Script to load existing cidrs to DDB Cidr Pool table and generate new config based for upgrade"
)
parser.add_argument('--AcceleratorPrefix', default='ASEA-',
                    help='The value set in AcceleratorPrefix')
parser.add_argument('--CoreOU', default='core',
                    help='Optional parameter. Defaults to core. The name of the core OU')
parser.add_argument('--ConfigFile', required=True, help='ConfigFile location')
parser.add_argument('--Region', required=True,
                    help='Region in which SEA is deployed')
parser.add_argument('--LoadDB', action='store_const', const=True, default=False, help="Flag to enable load existing cidrs to DynamoDB Tables")
parser.add_argument('--LoadConfig', action='store_const', const=True, default=False, help="Flag to enable Conversion of config file from pervious version")

config_sections = {
    'global-options': 'global-options',
    'organizational-units': 'organizational-units',
    'mandatory-account-configs': 'account',
    'workload-account-configs': 'account',
}
load_db_sections = {
    'mandatory-account-configs': 'account',
    'workload-account-configs': 'account',
    'organizational-units': 'organizational-units',
}
pools = {
    "main": "main",
    "sub": "RFC6598b",
}

def load_to_ddb(accel_prefix, region, config):
    vpc_table_name = '%scidr-vpc-assign' % accel_prefix
    subnet_table_name = '%scidr-subnet-assign' % accel_prefix
    dynamodb = boto3.resource('dynamodb', region)
    vpc_table = dynamodb.Table(vpc_table_name)
    subnet_table = dynamodb.Table(subnet_table_name)
    i = 1
    j = 1
    account_configs = copy.deepcopy(config['mandatory-account-configs'])
    account_configs.update(config.get('workload-account-configs', {}))
    for config_section in load_db_sections.keys():
        for key_name, section_config in config[config_section].items():
            if not section_config.get('vpc'):
                continue
            for vpc_config in section_config['vpc']:
                account_keys = []
                if vpc_config.get('cidr-src') == 'dynamic':
                    continue
                vpc_region = region if vpc_config['region'] == '${HOME_REGION}' else vpc_config['region']
                if vpc_config['deploy'] != 'local' and config_section == 'organizational-units':
                    account_ou_key = "account/%s" % vpc_config['deploy']
                else:
                    account_ou_key = "%s/%s" % (config_sections[config_section], key_name)
                if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                    account_keys = [key for key, value in account_configs.items() if value['ou'] == key_name]
                if vpc_config['name'] == '${CONFIG::OU_NAME}':
                    vpc_name = key_name
                else:
                    vpc_name = vpc_config['name']
                print("Adding CIDR for VPC %s in table %s" %
                      (vpc_name, vpc_table_name))
                cidrs = [cidr for cidr in vpc_config['cidr']] if type(vpc_config['cidr']) == list else [
                    {"value": vpc_config['cidr'], "pool": "main"}]
                if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                    for cidr_index, cidr_object in enumerate(cidrs):
                        vpc_table.put_item(
                            Item={
                                "account-ou-key": 'organizational-unit/%s' % key_name,
                                "cidr": cidr_object['value'],
                                "id": "%s" % i,
                                "pool": cidr_object['pool'],
                                "region": vpc_region,
                                "requester": "Manual",
                                "status": "assigned",
                                "vpc-name": vpc_name,
                                "vpc-assigned-id": cidr_index,
                            }
                        )
                        i = i + 1
                    for account_key in account_keys:
                        for cidr_index, cidr_object in enumerate(cidrs):
                            vpc_table.put_item(
                                Item={
                                    "account-ou-key": 'account/%s' % account_key,
                                    "cidr": cidr_object['value'],
                                    "id": "%s" % i,
                                    "pool": cidr_object['pool'],
                                    "region": vpc_region,
                                    "requester": "Manual",
                                    "status": "assigned",
                                    "vpc-name": vpc_name,
                                    "vpc-assigned-id": cidr_index,
                                }
                            )
                            i = i + 1
                else:
                    for cidr_index, cidr_object in enumerate(cidrs):
                        vpc_table.put_item(
                            Item={
                                "account-ou-key": account_ou_key,
                                "cidr": cidr_object['value'],
                                "id": "%s" % i,
                                "pool": cidr_object['pool'],
                                "region": vpc_region,
                                "requester": "Manual",
                                "status": "assigned",
                                "vpc-name": vpc_name,
                                "vpc-assigned-id": cidr_index,
                            }
                        )
                        i = i + 1
                if vpc_config.get('cidr2'):
                    # Not handling new config for cidr2 since we don't have that in new config
                    print("Adding CIDR2 for VPC %s in table %s" %
                          (vpc_config['name'], vpc_table_name))
                    if type(vpc_config['cidr2']) == list:
                        for cidr_index, cidr in enumerate(vpc_config['cidr2']):
                            if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                                vpc_table.put_item(
                                    Item={
                                        "account-ou-key": 'organizational-unit/%s' % key_name,
                                        "cidr": cidr,
                                        "id": "%s" % i,
                                        "pool": pools['sub'],
                                        "region": vpc_region,
                                        "requester": "Manual",
                                        "status": "assigned",
                                        "vpc-name": vpc_config['name'],
                                        "vpc-assigned-id": cidr_index + 1,
                                    }
                                )
                                i = i + 1
                                for account_key in account_keys:
                                    vpc_table.put_item(
                                        Item={
                                            "account-ou-key": "account/%s" % account_key,
                                            "cidr": cidr,
                                            "id": "%s" % i,
                                            "pool": pools['sub'],
                                            "region": vpc_region,
                                            "requester": "Manual",
                                            "status": "assigned",
                                            "vpc-name": vpc_config['name'],
                                            "vpc-assigned-id": cidr_index + 1,
                                        }
                                    )
                                    i = i + 1
                            else:
                                vpc_table.put_item(
                                    Item={
                                        "account-ou-key": account_ou_key,
                                        "cidr": cidr,
                                        "id": "%s" % i,
                                        "pool": pools['sub'],
                                        "region": vpc_region,
                                        "requester": "Manual",
                                        "status": "assigned",
                                        "vpc-name": vpc_config['name'],
                                        "vpc-assigned-id": cidr_index + 1,
                                    }
                                )
                                i = i + 1
                    else:
                        if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                            vpc_table.put_item(
                                Item={
                                    "account-ou-key": 'organizational-unit/%s' % key_name,
                                    "cidr": vpc_config['cidr2'],
                                    "id": "%s" % i,
                                    "pool": pools['sub'],
                                    "region": vpc_region,
                                    "requester": "Manual",
                                    "status": "assigned",
                                    "vpc-name": vpc_config['name'],
                                    "vpc-assigned-id": 1,
                                }
                            )
                            i = i + 1
                            for account_key in account_keys:
                                vpc_table.put_item(
                                    Item={
                                        "account-ou-key": "account/%s" % account_key,
                                        "cidr": vpc_config['cidr2'],
                                        "id": "%s" % i,
                                        "pool": pools['sub'],
                                        "region": vpc_region,
                                        "requester": "Manual",
                                        "status": "assigned",
                                        "vpc-name": vpc_config['name'],
                                        "vpc-assigned-id": 1,
                                    }
                                )
                                i = i + 1
                        else:
                            vpc_table.put_item(
                                Item={
                                    "account-ou-key": account_ou_key,
                                    "cidr": vpc_config['cidr2'],
                                    "id": "%s" % i,
                                    "pool": pools['sub'],
                                    "region": vpc_region,
                                    "requester": "Manual",
                                    "status": "assigned",
                                    "vpc-name": vpc_config['name'],
                                    "vpc-assigned-id": 1,
                                }
                            )
                            i = i + 1
                for subnet_config in vpc_config['subnets']:
                    subnet_name = subnet_config['name']
                    for subnet_definition in subnet_config['definitions']:
                        print("Adding CIDR for Subnet %s-%s in table %s" %
                              (subnet_config['name'], subnet_definition['az'], subnet_table_name))
                        if subnet_definition.get('cidr') and type(subnet_definition['cidr']) == dict:
                            cidr_obj = subnet_definition['cidr']
                        elif subnet_definition.get('cidr'):
                            cidr_obj = {
                                'value': subnet_definition['cidr'],
                                'pool': 'main'
                            }
                        elif subnet_definition.get('cidr2'):
                            cidr_obj = {
                                'value': subnet_definition['cidr2'],
                                'pool': pools['sub']
                            }
                        else:
                            cidr_obj = {
                                'cidr': subnet_definition.get('cidr', subnet_definition.get('cidr2')),
                                'pool': 'main' if subnet_definition.get('cidr') else pools['sub']
                            }
                        if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                            subnet_table.put_item(
                                Item={
                                    "account-ou-key": 'organizational-unit/%s' % key_name,
                                    "az": subnet_definition["az"],
                                    "cidr": cidr_obj['value'],
                                    "id": "%s" % j,
                                    "region": vpc_region,
                                    "requester": "Manual",
                                    "status": "assigned",
                                    "sub-pool": cidr_obj['pool'],
                                    "subnet-name": subnet_name,
                                    "vpc-name": vpc_name
                                }
                            )
                            j = j + 1
                            for account_key in account_keys:
                                subnet_table.put_item(
                                    Item={
                                        "account-ou-key": "account/%s" % account_key,
                                        "az": subnet_definition["az"],
                                        "cidr": cidr_obj['value'],
                                        "id": "%s" % j,
                                        "region": vpc_region,
                                        "requester": "Manual",
                                        "status": "assigned",
                                        "sub-pool": cidr_obj['pool'],
                                        "subnet-name": subnet_name,
                                        "vpc-name": vpc_name
                                    }
                                )
                                j = j + 1
                        else:
                            subnet_table.put_item(
                                Item={
                                    "account-ou-key": account_ou_key,
                                    "az": subnet_definition["az"],
                                    "cidr": cidr_obj['value'],
                                    "id": "%s" % j,
                                    "region": vpc_region,
                                    "requester": "Manual",
                                    "status": "assigned",
                                    "sub-pool": cidr_obj["pool"],
                                    "subnet-name": subnet_name,
                                    "vpc-name": vpc_name
                                }
                            )
                            j = j + 1


def impl(accel_prefix, config_file, region, load_db, load_config, core_ou):
    with open(config_file) as f:
        config = json.load(f)

    with open('prettier-config.json', 'w') as f:
        json.dump(config, f, indent=2)

    if load_db:
        load_to_ddb(accel_prefix, region, config)
    if not load_config:
        return
    print("Converting Configuration file with respect to updated accelerator")
    
    for config_section in config_sections.keys():
        if config_section == 'global-options':
            print('Updating global options')
            global_key_configs = config[config_section]
            if config[config_section].get('alz-baseline') == False or config[config_section].get('alz-baseline') == True:
                del config[config_section]['alz-baseline']
            for key_name in global_key_configs:
                ## This section will get renamed to aws-org-management
                if key_name == 'aws-org-master':
                    config[config_section][key_name]['add-sns-topics'] = True
                if key_name == 'central-security-services':
                    config[config_section][key_name]['macie-sensitive-sh'] = True
                    config[config_section][key_name]['fw-mgr-alert-level'] = "Low"
                    config[config_section][key_name]['security-hub-findings-sns'] = "Low"
                    config[config_section][key_name]['add-sns-topics'] = True
                if key_name == 'cloudwatch':
                    config[config_section][key_name]['metrics'].append({
                        'filter-name': 'IgnoreAuthorizationFailureMetric',
                        'accounts': ["management"],
                        'regions': ["${HOME_REGION}"],
                        'loggroup-name': '/${ACCELERATOR_PREFIX_ND}/CloudTrail',
                        'filter-pattern': '{($.errorCode=\"*UnauthorizedOperation\") || ($.errorCode=\"AccessDenied*\")}',
                        'metric-namespace': 'CloudTrailMetrics',
                        'metric-name': 'IgnoreAuthorizationFailureCount',
                        'metric-value': '1'
                    })
                    config[config_section][key_name]['metrics'].append({
                        'filter-name': 'IgnoreConsoleSignInWithoutMfaMetric',
                        'accounts': ["management"],
                        'regions': ["${HOME_REGION}"],
                        'loggroup-name': '/${ACCELERATOR_PREFIX_ND}/CloudTrail',
                        'filter-pattern': '{($.eventName=\"ConsoleLogin\") && ($.additionalEventData.MFAUsed !=\"Yes\")}',
                        'metric-namespace': 'CloudTrailMetrics',
                        'metric-name': 'IgnoreConsoleSignInWithoutMfaCount',
                        'metric-value': '1'
                    })
                
                    config[config_section][key_name]['alarms']['default-in-org-mgmt-use-lcl-sns'] = True

                    config[config_section][key_name]['alarms']['definitions'].append({
                        'alarm-name': 'IGNORE-AWS-Authorization-Failure',
                        'metric-name': 'IgnoreAuthorizationFailureCount',
                        'sns-alert-level': 'Ignore',
                        'alarm-description': 'Alarms when one or more unauthorized API calls are made (in any account, any region of your AWS Organization).'
                    })
                    config[config_section][key_name]['alarms']['definitions'].append({
                        'alarm-name': 'IGNORE-AWS-Console-SignIn-Without-MFA',
                        'metric-name': 'IgnoreConsoleSignInWithoutMfaCount',
                        'sns-alert-level': 'Ignore',
                        'alarm-description': 'Alarms when MFA is NOT used to sign into the console with IAM (in any account, any region of your AWS Organization).'
                    })
                if key_name == 'aws-config':
                    rules = config[config_section][key_name]['rules']
                    for rule in rules:
                        if rule['name'] == 'EC2-INSTANCE-PROFILE':
                            rule['runtime'] = 'nodejs18.x'

                        if rule['name'] == 'EC2-INSTANCE-PROFILE-PERMISSIONS':
                            rule['runtime'] = 'nodejs18.x'
                if key_name == 'scps':
                    scp_list = config[config_section][key_name]
                    scp_list.append({
                        'name': 'Guardrails-Part-0-Core',
                        'description': 'ASEA Guardrails Part 0 Core Accounts',
                        'policy': 'ASEA-Guardrails-Part0-CoreOUs.json',
                    })
                    for idx, scp in enumerate(scp_list):
                        if scp['name'] == 'Guardrails-Part-0':
                            scp['description'] = 'ASEA Guardrails Part 0 Workload Accounts'
                            scp['policy'] = 'ASEA-Guardrails-Part0-WkldOUs.json'
                        if scp['name'] == 'Guardrails-Part-2':
                            del config[config_section][key_name][idx]
                
                if key_name == 'security-hub-frameworks':
                    standards_list = config[config_section][key_name]['standards']
                    for standard in standards_list:
                        if standard['name'] == 'AWS Foundational Security Best Practices v1.0.0':
                            standard['controls-to-disable'] = ["IAM.1", "EC2.10", "Lambda.4"]
                        if standard['name'] == 'CIS AWS Foundations Benchmark v1.2.0':
                            standard['controls-to-disable'] = ["CIS.1.20", "CIS.1.22", "CIS.2.6"]
                            

        if config_section == 'mandatory-account-configs':
            print('Updating mandatory account configs')
            mandatory_key_configs = config[config_section]
            for key_name in mandatory_key_configs:
                alb_list = config[config_section][key_name].get('alb')
                if alb_list:
                    for alb in alb_list:
                        if alb.get('tg-stickiness') == "":
                            del alb['tg-stickiness']
                        target_list = alb['targets']
                        for target in target_list:
                            if target.get('lambda-filename') == "":
                                del target['lambda-filename']
                if config[config_section][key_name].get('share-mad-from') == "":
                    del config[config_section][key_name]['share-mad-from']

                if key_name == 'shared-network':
                    config[config_section][key_name]['description'] = 'This Account is used for centralized or shared networking resources.'
                    config[config_section][key_name]['ou'] = 'Infrastructure'
                    vpc_list = config[config_section][key_name].get('vpc')
                    if (vpc_list):
                        for vpc in vpc_list:
                            if vpc['name'] == 'Endpoint':
                                vpc['description'] = 'This VPC is used to host AWS Service Endpoints, making AWS services available using private address space.'
                            
                if key_name == 'operations':
                    config[config_section][key_name]['description'] = 'This Account is used for centralized IT Operational resources (MAD, rsyslog, ITSM, etc.).'
                    if 'mad' in config[config_section][key_name]['deployments']:
                        config[config_section][key_name]['deployments']['mad']['description'] = 'This directory is a) shared to most accounts in the organization to provide centralized Windows and Linux authentication for cloud workloads, b) used as an identity source for AWS SSO, c) used to inter-connect with on-premises directory services, and d) provides a single identities source for instance and AWS console access.'
                        config[config_section][key_name]['deployments']['mad']['image-path'] = '/aws/service/ami-windows-latest/Windows_Server-2016-English-Full-Base'
                        config[config_section][key_name]['ou'] = 'Infrastructure'
                        if config[config_section][key_name]['deployments']['mad'].get('share-to-account') == "":
                            del config[config_section][key_name]['deployments']['mad']['share-to-account']
                
                if key_name == 'perimeter':
                    config[config_section][key_name]['description'] = 'This Account is used for internet facing ingress/egress security services.'
                    config[config_section][key_name]['ou'] = 'Infrastructure'
                    firewall_list = config[config_section][key_name]['deployments'].get('firewalls')
                    if (firewall_list):
                        for firewall in firewall_list:
                            firewall['block-device-mappings'] = ["/dev/sda1", "/dev/sdb"]
                    if (config[config_section][key_name]['deployments'].get('firewall-manager')):
                        config[config_section][key_name]['deployments']['firewall-manager']['block-device-mappings'] = ["/dev/sda1", "/dev/sdb"]
                    vpc_list = config[config_section][key_name].get('vpc')
                    if (vpc_list):
                        for vpc in vpc_list:
                            if vpc['name'] == 'Perimeter':
                                vpc['description'] = 'This VPC is used to hold centralized ingress/egress (perimeter) security services.'
                                vpc['alb-forwarding'] = True

                if key_name == 'management':
                    config[config_section][key_name]['description'] = 'This is the Organization Management or root account.  Access must be highly restricted.  This account should not contain customer resources.'
                    config[config_section][key_name]['ou'] = 'Security'
                    vpc_list = config[config_section][key_name].get('vpc')
                    if (vpc_list):
                        for vpc in vpc_list:
                            if vpc['name'] == 'ForSSO':
                                vpc['description'] = 'This VPC is deployed in the Organization Management/root account to enable the deployment of the Active Directory Connector, enabling the use of Active Directory as the Identity source for AWS SSO.'
                
                if key_name == 'log-archive':
                    config[config_section][key_name]['ou'] = 'Security'
                    config[config_section][key_name]['description'] = 'This Account is used to centralized and store immutable logs for the Organization.'
                
                if key_name == 'security':
                    config[config_section][key_name]['ou'] = 'Security'
                    config[config_section][key_name]['description'] = 'This Account is used to centralized access to AWS security tooling and consoles.'

        if config_section == 'workload-account-configs' and config[config_section] != {}:
            print('Updating workload-account-configs')
            workload_key_configs = config[config_section]
            for key_name in workload_key_configs:
                alb_list = config[config_section][key_name].get('alb')
                if alb_list:
                    for alb in alb_list:
                        if alb.get('tg-stickiness') == "":
                            del alb['tg-stickiness']
                        target_list = alb['targets']
                        for target in target_list:
                            if target.get('lambda-filename') == "":
                                del target['lambda-filename'] 
            if config[config_section][key_name].get('share-mad-from') == "":
                del config[config_section][key_name]['share-mad-from']

        if config_section == 'organizational-units':
            print('Updating organizational-units')
            organizational_key_configs = config[config_section]
            for key_name in organizational_key_configs:
                alb_list = config[config_section][key_name].get('alb')
                if alb_list:
                    for alb in alb_list:
                        if alb.get('tg-stickiness') == "":
                            del alb['tg-stickiness']
                        target_list = alb['targets']
                        for target in target_list:
                            if target.get('lambda-filename') == "":
                                del target['lambda-filename']
                if config[config_section][key_name].get('share-mad-from') == "":
                    del config[config_section][key_name]['share-mad-from']

                scps = config[config_section][key_name].get('scps')
                if 'Guardrails-Part-2' in config[config_section][key_name]['scps']:
                    if scps:
                        config[config_section][key_name]['scps'].remove('Guardrails-Part-2')

                if key_name == core_ou:
                    print('Updating Core OU')
                    ## The core OU will be renamed to Security and copied to create the Infrastructure OU
                    config[config_section][key_name]['description'] = 'The Security OU is used to hold AWS accounts containing AWS security resources shared or utilized by the rest of the Organization.'
                    config[config_section][key_name]['scps'].remove('Guardrails-Part-0')
                    config[config_section][key_name]['scps'].append('Guardrails-Part-0-Core')
                elif key_name == 'Central':
                    config[config_section][key_name]['description'] = 'The Central OU is used to hold AWS accounts which contain group or team resources used across OU boundaries like code promotion tools.'
                    vpc_list = config[config_section][key_name]['vpc']
                    for vpc in vpc_list:
                        if vpc['name'] == 'Central':
                            vpc['description'] = 'This VPC is deployed in the shared network account and it\'s subnets are shared out to the Operations account and every account in the Central OU.'
                else:
                    config[config_section][key_name]['description'] = f'The {key_name} OU.'
                    vpc_list = config[config_section][key_name].get('vpc')
                    if vpc_list:
                        for vpc in vpc_list:
                            vpc['description'] = f'The {vpc["name"]} vpc in the {key_name} OU.'

            #create new infrastructure ou as a copy of core
            if core_ou in config[config_section]:
                infra_ou = config[config_section][core_ou]
                infra_ou['default-budgets']['name'] = 'Default Infrastructure Budget'
                infra_ou['description'] = 'The Infrastructure OU'
                infra_ou['description'] = 'The infrastructure OU is used to hold AWS accounts containing AWS infrastructure resources shared or utilized by the rest of the Organization.'
                config[config_section]['Infrastructure'] = infra_ou

        ## Update vpc's and subnet's
        if (config_section == 'mandatory-account-configs' or 
            config_section == 'workload-account-configs' or
            config_section == 'organizational-units'):
            forsso_cidr = "10.24.34.0/24"
            perimeter_rfc_cidr = "10.24.34.0/24"
            central_rfc_cidr = "10.24.34.0/24"
            key_configs = config[config_section]
            for key_name in key_configs:
                for vindex, vpcConfig in enumerate(key_configs[key_name].get('vpc', [])):
                    if type(config[config_section][key_name]['vpc'][vindex]['cidr']) == list:
                        print("Configuration for VPC %s is already in sync with updated SEA" % vpcConfig['name'])
                        continue
                    print(f'Updating vpc {config[config_section][key_name]["vpc"][vindex]["name"]}')
                    ## create main pool for cidr block
                    if (vpcConfig['deploy'] == 'local' and vpcConfig['name'] == 'ForSSO'):
                        cidr_pool = 'ForSSO'
                        forsso_cidr = vpcConfig['cidr']
                    else:
                        cidr_pool = 'main'
                    config[config_section][key_name]['vpc'][vindex]['cidr'] = [{
                        'value': vpcConfig['cidr'],
                        'size': int(vpcConfig['cidr'].split('/')[-1]),
                        'pool': cidr_pool,
                    }]

                    ## create pool for cidr2 block if it exists
                    if vpcConfig.get('cidr2'):
                        if type(vpcConfig['cidr2']) == list:
                            for cidr in vpcConfig['cidr2']:
                                if (vpcConfig['deploy'] == 'local' and vpcConfig['name'] == 'Perimeter'):
                                    cidr_pool = 'RFC6598b'
                                    perimeter_rfc_cidr = cidr
                                elif (vpcConfig['deploy'] == 'shared-network' and vpcConfig['name'] == 'Central'):
                                    cidr_pool = 'RFC6598a'
                                    central_rfc_cidr = cidr
                                else:
                                    cidr_pool = pools['sub']
                                config[config_section][key_name]['vpc'][vindex]['cidr'].append({
                                    'value': cidr,
                                    'pool': cidr_pool,
                                    'size': int(cidr.split('/')[-1]),
                                })
                        else:
                            if (vpcConfig['deploy'] == 'local' and vpcConfig['name'] == 'Perimeter'):
                                cidr_pool = 'RFC6598b'
                                perimeter_rfc_cidr = vpcConfig['cidr2']
                            elif (vpcConfig['deploy'] == 'shared-network' and vpcConfig['name'] == 'Central'):
                                cidr_pool = 'RFC6598a'
                                central_rfc_cidr = vpcConfig['cidr2']
                            else:
                                cidr_pool = pools['sub']
                            config[config_section][key_name]['vpc'][vindex]['cidr'].append({
                                'value': vpcConfig['cidr2'],
                                'pool': cidr_pool,
                                'size': int(vpcConfig['cidr2'].split('/')[-1]),
                            })
                        del config[config_section][key_name]['vpc'][vindex]['cidr2']
                    
                    ## add new keys and remove optional keys for vpc
                    config[config_section][key_name]['vpc'][vindex]['cidr-src'] = 'provided'
                    if config[config_section][key_name]['vpc'][vindex].get('igw') == False:
                        del config[config_section][key_name]['vpc'][vindex]['igw']
                    if not config[config_section][key_name]['vpc'][vindex]['vgw']:
                        del config[config_section][key_name]['vpc'][vindex]['vgw']
                    if not config[config_section][key_name]['vpc'][vindex]['pcx']:
                        del config[config_section][key_name]['vpc'][vindex]['pcx']
                    if not config[config_section][key_name]['vpc'][vindex]['natgw']:
                        del config[config_section][key_name]['vpc'][vindex]['natgw']
                    if 'tgw-attach' in config[config_section][key_name]['vpc'][vindex]:
                        if not config[config_section][key_name]['vpc'][vindex]['tgw-attach']:
                            del config[config_section][key_name]['vpc'][vindex]['tgw-attach']
                    if 'interface-endpoints' in config[config_section][key_name]['vpc'][vindex]:
                        if not config[config_section][key_name]['vpc'][vindex]['interface-endpoints']:
                            del config[config_section][key_name]['vpc'][vindex]['interface-endpoints']
                    
                    ## update subnets in vpc
                    for sindex, subnetConfig in enumerate(vpcConfig['subnets']):
                        for dindex, subnetDef in enumerate(subnetConfig['definitions']):
                            current_cidr = subnetDef['cidr'] if subnetDef.get('cidr', None) else subnetDef['cidr2']
                            print(current_cidr)
                            print(subnetDef.get('cidr'))
                            #if config[config_section][key_name]['vpc'][vindex]['subnets'][sindex]['definitions']['route-table'] == 'CentralVPC_Common'
                            #   config[config_section][key_name]['vpc'][vindex]['subnets'][sindex]['definitions']['route-table'] =  '${CONFIG::VPC_NAME}VPC_Common'
                            if (ipaddress.IPv4Network(current_cidr).overlaps(ipaddress.IPv4Network(perimeter_rfc_cidr))):
                                cidr_pool = 'RFC6598b'
                            elif (ipaddress.IPv4Network(current_cidr).overlaps(ipaddress.IPv4Network(central_rfc_cidr))):
                                cidr_pool = 'RFC6598a'
                            elif (ipaddress.IPv4Network(current_cidr).overlaps(ipaddress.IPv4Network(forsso_cidr))):
                                cidr_pool = 'ForSSO'
                            else:
                                cidr_pool = 'main'
                            config[config_section][key_name]['vpc'][vindex]['subnets'][sindex]['definitions'][dindex]['cidr'] = {
                                'value': current_cidr,
                                'pool': cidr_pool,
                                'size': int(current_cidr.split('/')[-1]),
                            }

    with open('update-config.json', 'w') as f:
        json.dump(config, f, indent=2)

    with open('update-config.json') as f:
        s = f.read()

    with open('update-config.json', 'w') as f:
        s = s.replace('"' + core_ou + '": {', '"Security": {')
        s = s.replace('aws-org-master', 'aws-org-management')
        f.write(s)

if __name__ == '__main__':
    args = parser.parse_args()
    if args.LoadDB and args.LoadConfig:
        print('Both LoadDB and LoadConfig cannot be used at the same time. Please run with only one options set.')
        exit(1)
    if (not args.LoadDB and not args.LoadConfig):
        print ("Both --LoadDB and --LoadConfig can't be null. Need an operation")
        exit(0)
    impl(args.AcceleratorPrefix, args.ConfigFile, args.Region, args.LoadDB, args.LoadConfig, args.CoreOU)
