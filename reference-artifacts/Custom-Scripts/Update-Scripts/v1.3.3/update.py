import boto3
import json
import argparse


parser = argparse.ArgumentParser(
  description="A Script to load existing cidrs to DDB Cidr Pool table and generate new config based for upgrade"
)
parser.add_argument('--AcceleratorPrefix', default='PBMMAccel-', help='The value set in AcceleratorPrefix')
parser.add_argument('--ConfigFile', required=True, help='ConfigFile location')
parser.add_argument('--Region', required=True, help='Region in which SEA is deployed')

def impl(accelPrefix, configFilePath, region):
  vpc_table_name = '%scidr-vpc-assign' %accelPrefix
  subnet_table_name = '%scidr-subnet-assign' %accelPrefix
  dynamodb = boto3.resource('dynamodb', region)
  vpc_table = dynamodb.Table(vpc_table_name)
  subnet_table = dynamodb.Table(subnet_table_name)
  i = 1
  j = 1
  with open(configFilePath) as f:
    config = json.load(f)
    for ou, ou_config in config['organizational-units'].items():
        if not ou_config.get('vpc'):
          continue
        for vpc_config in ou_config['vpc']:
          if vpc_config.get('cidr-src') == 'dynamic':
            continue
          print("Adding CIDR for VPC %s in table %s" %(vpc_config['name'], vpc_table_name))
          response = vpc_table.put_item(
            Item = {
              "account-ou-key": "organizational-unit/%s"%ou,
              "cidr": vpc_config['cidr'],
              "id": "%s"%i,
              "pool": "main",
              "region": vpc_config['region'],
              "requester": "Manual",
              "status": "assigned",
              "vpc-name": vpc_config['name']
            }
          )
          i = i + 1
          if vpc_config.get('cidr2'):
            print("Adding CIDR2 for VPC %s in table %s" %(vpc_config['name'], vpc_table_name))
            if (type(vpc_config['cidr2']) == list):
              for cidr in vpc_config['cidr2']:
                response = vpc_table.put_item(
                  Item = {
                    "account-ou-key": "organizational-unit/%s"%ou,
                    "cidr": cidr,
                    "id": "%s"%i,
                    "pool": "RFC6598",
                    "region": vpc_config['region'],
                    "requester": "Manual",
                    "status": "assigned",
                    "vpc-name": vpc_config['name'],
                  }
                )
                i = i + 1
            else:
              response = vpc_table.put_item(
                Item = {
                  "account-ou-key": "organizational-unit/%s"%ou,
                  "cidr": vpc_config['cidr2'],
                  "id": "%s"%i,
                  "pool": "RFC6598",
                  "region": vpc_config['region'],
                  "requester": "Manual",
                  "status": "assigned",
                  "vpc-name": vpc_config['name'],
                }
              )
              i = i + 1
          for subnet_config in vpc_config['subnets']:
              subnet_name = subnet_config['name']
              for subnet_definition in subnet_config['definitions']:
                print("Adding CIDR for Subnet %s-%s in table %s" %(subnet_config['name'], subnet_definition['az'], subnet_table_name))
                response = subnet_table.put_item(
                  Item = {
                    "account-ou-key": "organizational-unit/%s"%ou,
                    "az": subnet_definition["az"],
                    "cidr": subnet_definition.get('cidr', subnet_definition.get('cidr2')),
                    "id": "%s"%j,
                    "region": vpc_config['region'],
                    "requester": "Manual",
                    "status": "assigned",
                    "sub-pool":  subnet_definition["az"],
                    "subnet-name": subnet_name,
                    "vpc-name": vpc_config['name']
                  }
                )
                j = j +1
  for account_key, account_config in config['mandatory-account-configs'].items():
        if not account_config.get('vpc'):
          continue
        for vpc_config in account_config['vpc']:
          if vpc_config.get('cidr-src') == 'dynamic':
            continue
          print("Adding CIDR for VPC %s in table %s" %(vpc_config['name'], vpc_table_name))
          response = vpc_table.put_item(
            Item = {
              "account-ou-key": "account/%s"%account_key,
              "cidr": vpc_config['cidr'],
              "id": "%s"%i,
              "pool": "main",
              "region": vpc_config['region'],
              "requester": "Manual",
              "status": "assigned",
              "vpc-name": vpc_config['name']
            }
          )
          i = i + 1
          if vpc_config.get('cidr2'):
            print("Adding CIDR2 for VPC %s in table %s" %(vpc_config['name'], vpc_table_name))
            if (type(vpc_config['cidr2']) == list):
              for cidr in vpc_config['cidr2']:
                response = vpc_table.put_item(
                  Item = {
                    "account-ou-key": "account/%s"%account_key,
                    "cidr": cidr,
                    "id": "%s"%i,
                    "pool": "RFC6598",
                    "region": vpc_config['region'],
                    "requester": "Manual",
                    "status": "assigned",
                    "vpc-name": vpc_config['name'],
                  }
                )
                i = i + 1
            else:
              response = vpc_table.put_item(
                Item = {
                  "account-ou-key": "account/%s"%account_key,
                  "cidr": vpc_config['cidr2'],
                  "id": "%s"%i,
                  "pool": "RFC6598",
                  "region": vpc_config['region'],
                  "requester": "Manual",
                  "status": "assigned",
                  "vpc-name": vpc_config['name'],
                }
              )
              i = i + 1
          for subnet_config in vpc_config['subnets']:
              subnet_name = subnet_config['name']
              for subnet_definition in subnet_config['definitions']:
                print("Adding CIDR for Subnet %s-%s in table %s" %(subnet_config['name'], subnet_definition['az'], subnet_table_name))
                response = subnet_table.put_item(
                  Item = {
                    "account-ou-key": "account/%s"%account_key,
                    "az": subnet_definition["az"],
                    "cidr": subnet_definition.get('cidr', subnet_definition.get('cidr2')),
                    "id": "%s"%j,
                    "region": vpc_config['region'],
                    "requester": "Manual",
                    "status": "assigned",
                    "sub-pool":  subnet_definition["az"],
                    "subnet-name": subnet_name,
                    "vpc-name": vpc_config['name']
                  }
                )
                j = j +1
  for account_key, account_config in config['workload-account-configs'].items():
        if not account_config.get('vpc'):
          continue
        for vpc_config in account_config['vpc']:
          if vpc_config.get('cidr-src') == 'dynamic':
            continue
          print("Adding CIDR for VPC %s in table %s" %(vpc_config['name'], vpc_table_name))
          response = vpc_table.put_item(
            Item = {
              "account-ou-key": "account/%s"%account_key,
              "cidr": vpc_config['cidr'],
              "id": "%s"%i,
              "pool": "main",
              "region": vpc_config['region'],
              "requester": "Manual",
              "status": "assigned",
              "vpc-name": vpc_config['name']
            }
          )
          i = i + 1
          if vpc_config.get('cidr2'):
            print("Adding CIDR2 for VPC %s in table %s" %(vpc_config['name'], vpc_table_name))
            if (type(vpc_config['cidr2']) == list):
              for cidr in vpc_config['cidr2']:
                response = vpc_table.put_item(
                  Item = {
                    "account-ou-key": "account/%s"%account_key,
                    "cidr": cidr,
                    "id": "%s"%i,
                    "pool": "RFC6598",
                    "region": vpc_config['region'],
                    "requester": "Manual",
                    "status": "assigned",
                    "vpc-name": vpc_config['name'],
                  }
                )
                i = i + 1
            else:
              response = vpc_table.put_item(
                Item = {
                  "account-ou-key": "account/%s"%account_key,
                  "cidr": vpc_config['cidr2'],
                  "id": "%s"%i,
                  "pool": "RFC6598",
                  "region": vpc_config['region'],
                  "requester": "Manual",
                  "status": "assigned",
                  "vpc-name": vpc_config['name'],
                }
              )
              i = i + 1
          for subnet_config in vpc_config['subnets']:
              subnet_name = subnet_config['name']
              for subnet_definition in subnet_config['definitions']:
                print("Adding CIDR for Subnet %s-%s in table %s" %(subnet_config['name'], subnet_definition['az'], subnet_table_name))
                response = subnet_table.put_item(
                  Item = {
                    "account-ou-key": "account/%s"%account_key,
                    "az": subnet_definition["az"],
                    "cidr": subnet_definition.get('cidr', subnet_definition.get('cidr2')),
                    "id": "%s"%j,
                    "region": vpc_config['region'],
                    "requester": "Manual",
                    "status": "assigned",
                    "sub-pool":  subnet_definition["az"],
                    "subnet-name": subnet_name,
                    "vpc-name": vpc_config['name']
                  }
                )
                j = j +1
  account_configs = config['mandatory-account-configs']
  for account_key in account_configs:
    for vindex, vpcConfig in enumerate(account_configs[account_key].get('vpc', [])):
      if type(config['mandatory-account-configs'][account_key]['vpc'][vindex]['cidr']) == list:
        print("Configuration is already in sync with updated SEA")
        exit(0)
      config['mandatory-account-configs'][account_key]['vpc'][vindex]['cidr'] = [{
        'value': vpcConfig['cidr']
      }]
      if vpcConfig.get('cidr2'):
        if type(vpcConfig['cidr2']) == list:
          for cidr in vpcConfig['cidr2']:
            config['mandatory-account-configs'][account_key]['vpc'][vindex]['cidr'].append({
              'value': cidr
            })
        else:
          config['mandatory-account-configs'][account_key]['vpc'][vindex]['cidr'].append({
            'value': vpcConfig['cidr2']
          })
        del config['mandatory-account-configs'][account_key]['vpc'][vindex]['cidr2']
      for sindex, subnetConfig in enumerate(vpcConfig['subnets']):
        for dindex, subnetDef in enumerate(subnetConfig['definitions']):
          config['mandatory-account-configs'][account_key]['vpc'][vindex]['subnets'][sindex]['definitions'][dindex]['cidr'] = {
            'value': subnetDef.get('cidr') if subnetDef.get('cidr') else subnetDef.get('cid2')
          }
  w_account_configs = config['workload-account-configs']
  for account_key in w_account_configs:
    for vindex, vpcConfig in enumerate(w_account_configs[account_key].get('vpc', [])):
      config['workload-account-configs'][account_key]['vpc'][vindex]['cidr'] = [{
        'value': vpcConfig['cidr']
      }]
      if vpcConfig.get('cidr2'):
        if type(vpcConfig['cidr2']) == list:
          for cidr in vpcConfig['cidr2']:
            config['workload-account-configs'][account_key]['vpc'][vindex]['cidr'].append({
              'value': cidr
            })
        else:
          config['workload-account-configs'][account_key]['vpc'][vindex]['cidr'].append({
            'value': vpcConfig['cidr2']
          })
        del config['workload-account-configs'][account_key]['vpc'][vindex]['cidr2']
      for sindex, subnetConfig in enumerate(vpcConfig['subnets']):
        for dindex, subnetDef in enumerate(subnetConfig['definitions']):
          config['workload-account-configs'][account_key]['vpc'][vindex]['subnets'][sindex]['definitions'][dindex]['cidr'] = {
            'value': subnetDef.get('cidr') if subnetDef.get('cidr') else subnetDef.get('cid2')
          }
  ou_configs = config['organizational-units']
  for ou_key in ou_configs:
    for vindex, vpcConfig in enumerate(ou_configs[ou_key].get('vpc', [])):
      config['organizational-units'][ou_key]['vpc'][vindex]['cidr'] = [{
        'value': vpcConfig['cidr']
      }]
      if vpcConfig.get('cidr2'):
        if (type(vpcConfig['cidr2']) == list):
          for cidr in vpcConfig['cidr2']:
            config['organizational-units'][ou_key]['vpc'][vindex]['cidr'].append({
              'value': cidr
            })
        else:
          config['organizational-units'][ou_key]['vpc'][vindex]['cidr'].append({
            'value': vpcConfig['cidr2']
          })
        del config['organizational-units'][ou_key]['vpc'][vindex]['cidr2']
      for sindex, subnetConfig in enumerate(vpcConfig['subnets']):
        for dindex, subnetDef in enumerate(subnetConfig['definitions']):
          config['organizational-units'][ou_key]['vpc'][vindex]['subnets'][sindex]['definitions'][dindex]['cidr'] = {
            'value': subnetDef.get('cidr') if subnetDef.get('cidr') else subnetDef.get('cid2')
          }
  with open('update-config.json', 'w') as f:
    json.dump(config, f, indent=2)
if __name__ == '__main__':
  args = parser.parse_args()
  impl(args.AcceleratorPrefix, args.ConfigFile, args.Region)