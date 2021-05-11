import boto3
import json
import argparse
import copy


parser = argparse.ArgumentParser(
    description="A Script to load existing cidrs to DDB Cidr Pool table and generate new config based for upgrade"
)
parser.add_argument('--AcceleratorPrefix', default='PBMMAccel-',
                    help='The value set in AcceleratorPrefix')
parser.add_argument('--ConfigFile', required=True, help='ConfigFile location')
parser.add_argument('--Region', required=True,
                    help='Region in which SEA is deployed')

parser.add_argument('--LoadDB', action='store_const', const=True, default=False, help="Flag to enable load existing cidrs to DynamoDB Tables")
parser.add_argument('--LoadConfig', action='store_const', const=True, default=False, help="Flag to enable Conversion of config file from pervious version")

config_sections = {
    'organizational-units': 'organizational-unit',
    'mandatory-account-configs': 'account',
    'workload-account-configs': 'account',
}


def load_to_ddb(accel_prefix, region, config):
    vpc_table_name = '%scidr-vpc-assign' % accel_prefix
    subnet_table_name = '%scidr-subnet-assign' % accel_prefix
    dynamodb = boto3.resource('dynamodb', region)
    vpc_table = dynamodb.Table(vpc_table_name)
    subnet_table = dynamodb.Table(subnet_table_name)
    i = 1
    j = 1
    account_configs = copy.deepcopy(config['mandatory-account-configs']);
    account_configs.update(config.get('workload-account-configs', {}))
    for config_section in config_sections.keys():
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
                print("Adding CIDR for VPC %s in table %s" %
                      (vpc_config['name'], vpc_table_name))
                if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                    for account_key in account_keys:
                        vpc_table.put_item(
                            Item={
                                "account-ou-key": 'account/%s' % account_key,
                                "cidr": vpc_config['cidr'],
                                "id": "%s" % i,
                                "pool": "main",
                                "region": vpc_region,
                                "requester": "Manual",
                                "status": "assigned",
                                "vpc-name": vpc_config['name']
                            }
                        )
                        i = i + 1
                else:
                    vpc_table.put_item(
                        Item={
                            "account-ou-key": account_ou_key,
                            "cidr": vpc_config['cidr'],
                            "id": "%s" % i,
                            "pool": "main",
                            "region": vpc_region,
                            "requester": "Manual",
                            "status": "assigned",
                            "vpc-name": vpc_config['name']
                        }
                    )
                    i = i + 1
                if vpc_config.get('cidr2'):
                    print("Adding CIDR2 for VPC %s in table %s" %
                          (vpc_config['name'], vpc_table_name))
                    if type(vpc_config['cidr2']) == list:
                        for cidr in vpc_config['cidr2']:
                            if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                                for account_key in account_keys:
                                    vpc_table.put_item(
                                        Item={
                                            "account-ou-key": "account/%s" % account_key,
                                            "cidr": cidr,
                                            "id": "%s" % i,
                                            "pool": "RFC6598",
                                            "region": vpc_region,
                                            "requester": "Manual",
                                            "status": "assigned",
                                            "vpc-name": vpc_config['name'],
                                        }
                                    )
                                    i = i + 1
                            else:
                                vpc_table.put_item(
                                    Item={
                                        "account-ou-key": account_ou_key,
                                        "cidr": cidr,
                                        "id": "%s" % i,
                                        "pool": "RFC6598",
                                        "region": vpc_region,
                                        "requester": "Manual",
                                        "status": "assigned",
                                        "vpc-name": vpc_config['name'],
                                    }
                                )
                                i = i + 1
                    else:
                        if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                            for account_key in account_keys:
                                vpc_table.put_item(
                                    Item={
                                        "account-ou-key": "account/%s" % account_key,
                                        "cidr": vpc_config['cidr2'],
                                        "id": "%s" % i,
                                        "pool": "RFC6598",
                                        "region": vpc_region,
                                        "requester": "Manual",
                                        "status": "assigned",
                                        "vpc-name": vpc_config['name'],
                                    }
                                )
                                i = i + 1
                        else:
                            vpc_table.put_item(
                                Item={
                                    "account-ou-key": account_ou_key,
                                    "cidr": vpc_config['cidr2'],
                                    "id": "%s" % i,
                                    "pool": "RFC6598",
                                    "region": vpc_region,
                                    "requester": "Manual",
                                    "status": "assigned",
                                    "vpc-name": vpc_config['name'],
                                }
                            )
                            i = i + 1
                for subnet_config in vpc_config['subnets']:
                    subnet_name = subnet_config['name']
                    for subnet_definition in subnet_config['definitions']:
                        print("Adding CIDR for Subnet %s-%s in table %s" %
                              (subnet_config['name'], subnet_definition['az'], subnet_table_name))
                        if vpc_config['deploy'] == 'local' and config_section == 'organizational-units':
                            for account_key in account_keys:
                                subnet_table.put_item(
                                    Item={
                                        "account-ou-key": "account/%s" % account_key,
                                        "az": subnet_definition["az"],
                                        "cidr": subnet_definition.get('cidr', subnet_definition.get('cidr2')),
                                        "id": "%s" % j,
                                        "region": vpc_region,
                                        "requester": "Manual",
                                        "status": "assigned",
                                        "sub-pool": subnet_definition["az"],
                                        "subnet-name": subnet_name,
                                        "vpc-name": vpc_config['name']
                                    }
                                )
                                j = j + 1
                        else:
                            subnet_table.put_item(
                                Item={
                                    "account-ou-key": account_ou_key,
                                    "az": subnet_definition["az"],
                                    "cidr": subnet_definition.get('cidr', subnet_definition.get('cidr2')),
                                    "id": "%s" % j,
                                    "region": vpc_region,
                                    "requester": "Manual",
                                    "status": "assigned",
                                    "sub-pool": subnet_definition["az"],
                                    "subnet-name": subnet_name,
                                    "vpc-name": vpc_config['name']
                                }
                            )
                            j = j + 1


def impl(accel_prefix, config_file, region, load_db, load_config):
    with open(config_file) as f:
        config = json.load(f)
    if load_db:
        load_to_ddb(accel_prefix, region, config)
    if not load_config:
        return
    print("Converting Configigutation file with respect to updated accelerator")
    for config_section in config_sections.keys():
        key_configs = config[config_section]
        for key_name in key_configs:
            for vindex, vpcConfig in enumerate(key_configs[key_name].get('vpc', [])):
                if type(config[config_section][key_name]['vpc'][vindex]['cidr']) == list:
                    print("Configuration for VPC %s is already in sync with updated SEA" % vpcConfig['name'])
                    continue
                config[config_section][key_name]['vpc'][vindex]['cidr'] = [{
                    'value': vpcConfig['cidr'],
                    'size': int(vpcConfig['cidr'].split('/')[-1]),
                    'pool': 'main',
                }]
                if vpcConfig.get('cidr2'):
                    if type(vpcConfig['cidr2']) == list:
                        for cidr in vpcConfig['cidr2']:
                            config[config_section][key_name]['vpc'][vindex]['cidr'].append({
                                'value': cidr,
                                'size': int(cidr.split('/')[-1]),
                                'pool': 'RFC6598',
                            })
                    else:
                        config[config_section][key_name]['vpc'][vindex]['cidr'].append({
                            'value': vpcConfig['cidr2'],
                            'size': int(vpcConfig['cidr2'].split('/')[-1]),
                            'pool': 'RFC6598',
                        })
                    del config[config_section][key_name]['vpc'][vindex]['cidr2']
                for sindex, subnetConfig in enumerate(vpcConfig['subnets']):
                    for dindex, subnetDef in enumerate(subnetConfig['definitions']):
                        current_cidr = subnetDef.get('cidr') if subnetDef.get('cidr') else subnetDef.get('cid2')
                        config[config_section][key_name]['vpc'][vindex]['subnets'][sindex]['definitions'][dindex]['cidr'] = {
                            'value': current_cidr,
                            'size': int(current_cidr.split('/')[-1]),
                            'pool': 'main' if subnetDef.get('cidr') else 'RFC6598',
                        }
    with open('update-config.json', 'w') as f:
        json.dump(config, f, indent=2)


if __name__ == '__main__':
    args = parser.parse_args()
    if (not args.LoadDB and not args.LoadConfig):
        print ("Both --LoadDB and --LoadConfig can't be null. Need any operation")
        exit(0)
    impl(args.AcceleratorPrefix, args.ConfigFile, args.Region, args.LoadDB, args.LoadConfig)
