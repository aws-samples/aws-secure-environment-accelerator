import yaml
import argparse
import json
import os


pseudo_params = ['AWS::AccountId', 'AWS::NotificationARNs', 'AWS::Partition',
                 'AWS::Region', 'AWS::StackId', 'AWS::StackName', 'AWS::URLSuffix']
none_param = 'AWS::NoValue'
rules = []
ruleNames = []

def generate_config(input_path, input_format, output_format):
    files = (file for file in os.listdir(input_path)
             if os.path.isfile(os.path.join(input_path, file)))
    for file_name in files:
        if not file_name.endswith(input_format):
            continue
        with open(os.path.join(input_path, file_name)) as f:
            if input_format == 'yaml':
                data = yaml.load(f, Loader=yaml.FullLoader)
        generate_config_impl(data)
    
    with open(os.path.join(input_path, 'output',  'accel-config-rules.' + output_format), 'w') as writefile:
        print("Created Config Rules configuration in  : %s" %
              os.path.join(input_path, 'output',  'accel-config-rules.' + output_format))
        if output_format == 'json':
            json.dump(rules, writefile, indent=2)
            print(json.dumps(ruleNames))
        else:
            yaml.dump(rules, writefile, indent=2)
            print(yaml.dump(ruleNames))


def generate_config_impl(data):
    parameters = data.get("Parameters", [])
    resources = data.get("Resources", {})
    for name, props in resources.items():
        rule = {}
        if props['Type'] != "AWS::Config::ConfigRule":
            continue
        if not props["Properties"]["Source"] or props["Properties"]["Source"]["Owner"] != 'AWS':
            continue
        rule['name'] = props["Properties"]["Source"]["SourceIdentifier"]
        ruleNames.append(props["Properties"]["Source"]["SourceIdentifier"])
        for param_name, value in props["Properties"].get("InputParameters", {}).items():
            if 'parameters' not in rule:
                rule['parameters'] = {}
            if not isinstance(value, dict):
                rule['parameters'][param_name] = value
            else:
                if 'Ref' in value:
                    if parameters.get(value['Ref']) and parameters.get(value['Ref']).get('Default'):
                        rule['parameters'][param_name] = parameters[value['Ref']]['Default']
                elif 'Fn::If' in value:
                    true_val = value['Fn::If'][1]
                    false_val = value['Fn::If'][2] if len(
                        value['Fn::If']) > 2 else None
                    if isinstance(true_val, dict) and 'Ref' in true_val:
                        if parameters.get(true_val['Ref']):
                            if true_val['Ref'] in pseudo_params:
                                rule['parameters'][param_name] = true_val['Ref']
                            elif parameters.get(true_val['Ref']).get('Default'):
                                rule['parameters'][param_name] = parameters[true_val['Ref']]['Default']
                    elif isinstance(true_val, str):
                        rule['parameters'][param_name] = true_val
                    elif isinstance(false_val, dict):
                        if parameters.get(false_val['Ref']):
                            if false_val['Ref'] in pseudo_params:
                                rule['parameters'][param_name] = false_val['Ref']
                            elif parameters.get(false_val['Ref']).get('Default'):
                                rule['parameters'][param_name] = parameters[false_val['Ref']]['Default']
                    elif isinstance(false_val, str):
                        rule['parameters'][param_name] = false_val
                if param_name not in rule["parameters"]:
                    rule['parameters'][param_name] = "${REPLACE::%s}" % param_name
        rules.append(rule)
    return


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate Config Options')
    parser.add_argument('--path', required=True,
                        help='Input File path', default=os.path.expanduser('~'))
    parser.add_argument('--outputFormat', required=False,
                        choices=['json', 'yaml'], help='json/yaml', default='json')
    parser.add_argument('--inputFormat', required=False,
                        choices=['json', 'yaml'], help='json/yaml', default='yaml')
    args = parser.parse_args()
    if not os.path.exists(os.path.join(args.path, 'output')):
        os.mkdir(os.path.join(args.path, 'output'))
    generate_config(args.path, args.inputFormat, args.outputFormat)
