import argparse
import json
import logging
import os
import re
from datetime import datetime
from typing import Dict, List

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


def get_ec2_client(account_key, account_list, assume_role, region):
    """
    Returns an EC2 client with appropriate credentials for account
    account_key: account key from ASEA config
    assume_role: name of role to assume
    region: AWS region to connect to
    """
    try:
        # find account ID by key
        account_id = next(
            (account['id'] for account in account_list if account['key'] == account_key), None)

        if account_id is None:
            raise ValueError(f'Account ID not found for key: {account_key}')

        sts_client = boto3.client('sts')
        role_arn = f"arn:aws:iam::{account_id}:role/{assume_role}"

        try:
            response = sts_client.assume_role(
                RoleArn=role_arn, RoleSessionName="LZA-Migration-Check")
        except sts_client.exceptions.ClientError as e:
            logger.error(f"Failed to assume role {role_arn}: {str(e)}")
            raise

        session = boto3.Session(
            aws_access_key_id=response['Credentials']['AccessKeyId'],
            aws_secret_access_key=response['Credentials']['SecretAccessKey'],
            aws_session_token=response['Credentials']['SessionToken'])

        return session.client("ec2", region_name=region)
    except Exception as e:
        logger.error(f"Error creating EC2 client: {str(e)}")
        raise


def get_accounts_config(parameter_table_name, region="ca-central-1"):
    """
    Get accounts configuration from DynamoDB parameter table

    Args:
        parameter_table_name: Name of the DynamoDB parameter table
        region: AWS region where the table exists

    Returns:
        list: List of account configurations

    Raises:
        ClientError: If AWS API call fails
        ValueError: If parameters not found in table
    """
    try:
        client = boto3.client('dynamodb', region_name=region)
        accounts = []

        index = 0
        while True:
            response = client.get_item(
                TableName=parameter_table_name,
                Key={'id': {'S': f"accounts/{index}"}}
            )
            if 'Item' not in response:
                break
            accounts.extend(json.loads(response['Item']['value']['S']))
            index += 1

        return accounts
    except ClientError as e:
        logger.error(f"Failed to get accounts config from DynamoDB: {str(e)}")
        raise
    except (KeyError, ValueError) as e:
        logger.error(f"Invalid accounts configuration format: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting accounts config: {str(e)}")
        raise


def get_vpcs_from_config(aseaConfig, region):
    """
    Returns a dictionary of accounts with their respective VPCs for the provided region
    """

    vpc_dict = {}

    def process_vpc_config(account, vpc, vpc_dict):
        vpc_config = {
            "Name": vpc['name'],
            "Deploy": vpc['deploy'],
            "Account": account,
            "Region": vpc['region'],
            "Subnets": flatten_subnet_config(vpc['name'], vpc['subnets']),
            "RouteTables": vpc['route-tables'],
            "TgwAttachName": (f"{vpc['name']}_{vpc['tgw-attach']['associate-to-tgw']}_att"
                              if 'tgw-attach' in vpc else None),
            "tgw-attach": vpc.get('tgw-attach')
        }
        vpc_dict.setdefault(account, []).append(vpc_config)

    # Process mandatory accounts
    for account, config in aseaConfig["mandatory-account-configs"].items():
        if "vpc" in config:
            for vpc in config["vpc"]:
                process_vpc_config(
                    account, vpc, vpc_dict) if vpc['region'] == region else None

    # Process workload accounts
    for account, config in aseaConfig["workload-account-configs"].items():
        if "vpc" in config:
            for vpc in config["vpc"]:
                process_vpc_config(
                    account, vpc, vpc_dict) if vpc['region'] == region else None

    # Process OUs
    for ou, config in aseaConfig["organizational-units"].items():
        if "vpc" in config:
            for vpc in config["vpc"]:
                if vpc['deploy'] != "local":
                    process_vpc_config(
                        vpc['deploy'], vpc, vpc_dict) if vpc['region'] == region else None

    return vpc_dict


def flatten_subnet_config(vpc_name, subnets):
    """Takes subnet object from ASEA config and generate list of subnets to be created per AZ"""
    return [
        {"Name": f"{subnet['name']}_{vpc_name}_az{d['az']}_net",
         "route-table": f"{d['route-table']}_rt"}
        for subnet in subnets
        for d in subnet["definitions"]
        if not d.get('disabled', False)
    ]


def get_account_vpcs(ec2_client):
    """Returns dict of VPCs in account. key: Name, Value: VpcId"""
    response = ec2_client.describe_vpcs()
    return {
        next((tag["Value"] for tag in vpc["Tags"] if tag["Key"] == "Name"), ""): vpc["VpcId"]
        for vpc in response["Vpcs"]
    }


def get_transit_gateway(ec2Client) -> Dict:
    """
    Get Transit Gateway details from account

    Args:
        ec2_client: EC2 client with credentials for the account

    Returns:
        dict: Transit Gateway details including attachments and route tables

    Raises:
        ClientError: If AWS API call fails
        ValueError: If no Transit Gateway is found
    """
    try:
        response = ec2Client.describe_transit_gateways()

        tgw_list = []
        for tgw in response["TransitGateways"]:
            name = next((tag["Value"] for tag in tgw["Tags"]
                        if tag["Key"] == "Name"), tgw["TransitGatewayId"])
            t = {
                "Name": name,
                "TransitGatewayId": tgw["TransitGatewayId"],
                "OwnerId": tgw["OwnerId"],
                "State": tgw["State"],
                "Attachments": get_transit_gateway_attachments(ec2Client, tgw["TransitGatewayId"]),
                "RouteTables": get_transit_gateway_route_tables(ec2Client, tgw["TransitGatewayId"]),
                "RawResponse": tgw
            }

            tgw_list.append(t)

        return tgw_list
    except ClientError as e:
        logger.error(f"Failed to get Transit Gateway: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting Transit Gateway: {str(e)}")
        raise


def get_transit_gateway_attachments(ec2_client, tgw_id: str) -> List[Dict]:
    """
    Get Transit Gateway attachments

    Args:
        ec2_client: EC2 client with credentials for the account
        tgw_id: Transit Gateway ID

    Returns:
        list: List of Transit Gateway attachments

    Raises:
        ClientError: If AWS API call fails
        ValueError: If required attachment data is missing
    """
    try:
        tgwa_list = []
        paginator = ec2_client.get_paginator(
            'describe_transit_gateway_attachments')

        for page in paginator.paginate(
            Filters=[{"Name": "transit-gateway-id", "Values": [tgw_id]}]
        ):
            for tgwa in page.get("TransitGatewayAttachments", []):
                if not all(k in tgwa for k in ["TransitGatewayAttachmentId", "TransitGatewayId", "ResourceId", "ResourceType"]):
                    logger.warning(f"Incomplete attachment data found: {tgwa}")
                    continue

                name = next((tag["Value"] for tag in tgwa.get("Tags", [])
                             if tag["Key"] == "Name"), tgwa["TransitGatewayAttachmentId"])

                tgwa_list.append({
                    "Name": name,
                    "TransitGatewayAttachmentId": tgwa["TransitGatewayAttachmentId"],
                    "TransitGatewayId": tgwa["TransitGatewayId"],
                    "ResourceId": tgwa["ResourceId"],
                    "ResourceType": tgwa["ResourceType"],
                    "Association": tgwa["Association"]["TransitGatewayRouteTableId"] if "Association" in tgwa else None,
                    "RawResponse": tgwa
                })

        return tgwa_list
    except ClientError as e:
        logger.error(f"Failed to get Transit Gateway attachments: {str(e)}")
        raise
    except Exception as e:
        logger.error(
            f"Unexpected error getting Transit Gateway attachments: {str(e)}")
        raise


def get_transit_gateway_route_tables(ec2_client, tgw_id: str) -> List[Dict]:
    """
    Get Transit Gateway route tables

    Args:
        ec2_client: EC2 client with credentials for the account
        tgw_id: Transit Gateway ID

    Returns:
        list: List of route tables with their active routes

    Raises:
        ClientError: If AWS API call fails
    """
    try:
        tgwrt_list = []
        paginator = ec2_client.get_paginator(
            'describe_transit_gateway_route_tables')

        for page in paginator.paginate(
            Filters=[{"Name": "transit-gateway-id", "Values": [tgw_id]}]
        ):
            for tgwrt in page.get("TransitGatewayRouteTables", []):
                try:
                    active_routes = get_transit_gateway_routes(
                        ec2_client, tgwrt["TransitGatewayRouteTableId"], "active")
                    blackhole_routes = get_transit_gateway_routes(
                        ec2_client, tgwrt["TransitGatewayRouteTableId"], "blackhole")
                except Exception as e:
                    logger.error(f"Failed to get routes for table {
                                 tgwrt['TransitGatewayRouteTableId']}: {str(e)}")
                    active_routes = []

                name = next((tag["Value"] for tag in tgwrt.get("Tags", [])
                             if tag["Key"] == "Name"), tgwrt["TransitGatewayRouteTableId"])

                tgwrt_list.append({
                    "Name": name,
                    "TransitGatewayRouteTableId": tgwrt["TransitGatewayRouteTableId"],
                    "TransitGatewayId": tgwrt["TransitGatewayId"],
                    "ActiveRoutes": active_routes,
                    "BlackHoleRoutes": blackhole_routes,
                    "RawResponse": tgwrt
                })

        return tgwrt_list
    except ClientError as e:
        logger.error(f"Failed to get Transit Gateway route tables: {str(e)}")
        raise
    except Exception as e:
        logger.error(
            f"Unexpected error getting Transit Gateway route tables: {str(e)}")
        raise


def get_transit_gateway_routes(ec2_client, tgwrt_id: str, state: str) -> List[Dict]:
    """
    Get Transit Gateway routes for a route table

    Args:
        ec2_client: EC2 client with credentials for the account
        tgwrt_id: Transit Gateway route table ID
        state: Route state to filter by (e.g., 'active', 'blackhole')

    Returns:
        list: List of routes matching the specified state

    Raises:
        ClientError: If AWS API call fails
        ValueError: If invalid state is provided
    """
    valid_states = ['active', 'blackhole', 'deleted', 'deleting', 'pending']
    if state not in valid_states:
        raise ValueError(f"Invalid route state. Must be one of: {
                         ', '.join(valid_states)}")

    try:
        response = ec2_client.search_transit_gateway_routes(
            TransitGatewayRouteTableId=tgwrt_id,
            Filters=[{'Name': 'state', 'Values': [state]}]
        )

        tgwr_list = []
        for tgwr in response.get("Routes", []):
            if ("TransitGatewayAttachments" in tgwr and len(tgwr["TransitGatewayAttachments"]) > 0):
                for tgwa in tgwr["TransitGatewayAttachments"]:
                    tgwr_list.append({
                        "DestinationCidrBlock": tgwr["DestinationCidrBlock"],
                        "Type": tgwr.get("Type", ""),
                        "State": tgwr["State"],
                        "ResourceId": tgwa.get("ResourceId", ""),
                        "ResourceType": tgwa.get("ResourceType", "")
                    })
            else:
                tgwr_list.append({
                    "DestinationCidrBlock": tgwr["DestinationCidrBlock"],
                    "Type": tgwr.get("Type", ""),
                    "State": tgwr["State"]
                })

        return tgwr_list
    except ClientError as e:
        logger.error(f"Failed to get Transit Gateway routes: {str(e)}")
        raise
    except Exception as e:
        logger.error(
            f"Unexpected error getting Transit Gateway routes: {str(e)}")
        raise


def get_vpc_route_tables(ec2_client, vpcId):
    """
    Returns all route tables of a VPC
    ec2_client: EC2 client with credentials for the account of the VPC
    vpcId: id of VPC to get route tables
    """

    response = ec2_client.describe_route_tables(
        Filters=[{"Name": "vpc-id", "Values": [vpcId]}])
    rt_list = []

    for rt in response["RouteTables"]:
        name = next((tag["Value"] for tag in rt["Tags"]
                    if tag["Key"] == "Name"), rt["RouteTableId"])
        r = {"Name": name,
             "RouteTableId": rt["RouteTableId"],
             "VpcId": rt["VpcId"],
             "SubnetAssociations": [asso["SubnetId"] for asso in rt["Associations"] if "SubnetId" in asso],
             "Routes": rt["Routes"],
             "RawResponse": rt
             }
        rt_list.append(r)

    return rt_list


def get_vpc_subnets(ec2_client, vpcId):
    """
    Returns all subnets of a VPC
    ec2_client: EC2 client with credentials for the account of the VPC
    vpcId: id of VPC to get subnets
    """

    response = ec2_client.describe_subnets(
        Filters=[{"Name": "vpc-id", "Values": [vpcId]}])
    subnet_list = []

    for subnet in response["Subnets"]:
        name = next((tag["Value"] for tag in subnet["Tags"]
                    if tag["Key"] == "Name"), subnet["SubnetId"])
        s = {"Name": name,
             "SubnetId": subnet["SubnetId"],
             "VpcId": subnet["VpcId"],
             "AvailabilityZone": subnet["AvailabilityZone"],
             "RawResponse": subnet
             }
        subnet_list.append(s)

    return subnet_list


def map_subnets_to_route_table(subnets, route_tables):
    """
    Takes a list of subnets and list of route tables from a VPC and match the subnet with its associated route table
    """

    list = []

    for subnet in subnets:
        rt = [rt for rt in route_tables if subnet['SubnetId']
              in [s for s in rt['SubnetAssociations']]]
        if len(rt) == 0:
            logger.info(
                f"map_subnets_to_route_table: Can't find route table for {subnet['Name']}")
            continue

        list.append({"SubnetName": subnet["Name"],
                     "SubnetId": subnet["SubnetId"],
                     "RouteTableName": rt[0]["Name"],
                     "RouteTableId": rt[0]["RouteTableId"]})

    return list


def analyze_vpcs(vpc_from_config, account_list, role_to_assume, region):
    """
    Find all VPCs defined in the config with their route tables and subnets
    Works only in a single region. Need to be updated to describe VPC in all regions where VPC are configured
    """

    drift = {
        "vpcs_not_in_config": [],
        "route_tables_not_in_config": [],
        "route_tables_not_deployed": [],
        "subnets_not_in_config": [],
        "subnets_not_deployed": [],
        "subnets_not_associated": [],
        "subnet_route_table_mismatches": [],
    }
    vpc_details = {}

    for account in vpc_from_config.keys():
        client = get_ec2_client(account, account_list, role_to_assume, region)
        deployed_vpcs = get_account_vpcs(client)

        # check if there are more VPCs than in the config
        for dv in deployed_vpcs.keys():
            cv = [vpc for vpc in vpc_from_config[account]
                  if f"{vpc['Name']}_vpc" == dv]
            if len(cv) == 0:
                logger.warning(
                    f"VPC {dv} exists in account {account} but not in config")
                drift["vpcs_not_in_config"].append(
                    {"Vpc": dv, "Account": account})
                continue

            logger.info(f"VPC {dv} in account {account} found in config")

            # check if there are more route table than in the config
            d_rtables = get_vpc_route_tables(client, deployed_vpcs[dv])
            for drt in d_rtables:
                crt = [rt for rt in cv[0]["RouteTables"]
                       if f"{rt['name']}_rt" == drt["Name"]]
                if len(crt) == 0:
                    logger.warning(
                        f"Route table {drt['Name']} exists in VPC {dv} but not in config")
                    drift["route_tables_not_in_config"].append(
                        {"RouteTable": drt["Name"], "Vpc": dv})
                    continue

            # check if all route tables from the config exist in the environment
            # configured route tables that have been deleted/renamed should also show up in CloudFormation drift detection
            for crt in cv[0]["RouteTables"]:
                drt = [
                    rt for rt in d_rtables if f"{crt['name']}_rt" == rt["Name"]]
                if len(drt) == 0:
                    logger.warning(
                        f"Route table {crt['name']} exists in config but not deployed")
                    drift["route_tables_not_deployed"].append(
                        {"RouteTable": crt['name'], "Vpc": dv})
                    continue

            # check if there are more subnets than in the config
            d_subnets = get_vpc_subnets(client, deployed_vpcs[dv])
            for ds in d_subnets:
                cs = [s for s in cv[0]["Subnets"] if s['Name'] == ds["Name"]]
                if len(cs) == 0:
                    logger.warning(
                        f"Subnet {ds['Name']} exists in VPC {dv} but not in config")
                    drift["subnets_not_in_config"].append(
                        {"Subnet": ds["Name"], "Vpc": dv})
                    continue

            subnet_associations = map_subnets_to_route_table(
                d_subnets, d_rtables)

            # check if subnet association is different between config and account
            # this won't show up in CloudFormation drift detection as drift detection is not supported on AWS::EC2::SubnetRouteTableAssociation
            for cs in cv[0]["Subnets"]:
                ds = [s for s in d_subnets if s['Name'] == cs["Name"]]
                if len(ds) == 0:
                    logger.warning(
                        f"Subnet {cs['Name']} exists in config but not deployed")
                    drift["subnets_not_deployed"].append(
                        {"Subnet": cs['Name'], "Vpc": dv})
                    continue

                # find configured subnet in deployed associations
                a = [a for a in subnet_associations if a["SubnetName"] == cs["Name"]]
                if len(a) == 0:
                    logger.warning(
                        f"Subnet {cs['Name']} not found in subnet associations")
                    drift["subnets_not_associated"].append(
                        {"Subnet": cs['Name'], "Vpc": dv})
                    continue

                # check if deployed route table is same as config route table
                if cs["route-table"] != a[0]["RouteTableName"]:
                    logger.warning(
                        f"Subnet {cs['Name']} has route table {cs['route-table']} in config but route table {a[0]['RouteTableName']} is deployed")
                    drift["subnet_route_table_mismatches"].append(
                        {"Subnet": cs['Name'], "Vpc": dv, "ConfigRouteTable": cs["route-table"], "DeployedRouteTable": a[0]["RouteTableName"]})
                    continue

            vpc_details[dv] = {
                "Account": account, "RouteTables": d_rtables, "Subnets": d_subnets}

        return {"Drift": drift, "VpcDetails": vpc_details}


def get_tgw_from_config(asea_config, region):
    """
    Get all Transit Gateways defined in the config for the provided region
    asea_config: ASEA Config
    region: the region for which the transit gateways must be fetched
    """
    tgw_list = []

    # Find TGW deployments from shared-account
    for tgw in asea_config["mandatory-account-configs"]["shared-network"]["deployments"]["tgw"]:
        # Only include TGWs from the specified region
        if tgw.get("region") == region:
            tgw_list.append({
                "name": tgw["name"],
                "asn": tgw["asn"],
                "region": tgw["region"],
                "route-tables": tgw["route-tables"] if "route-tables" in tgw else [],
                "tgw-routes": tgw["tgw-routes"] if "tgw-routes" in tgw else []
            })

    return tgw_list


def analyze_tgw(tgw_config, tgw_details, vpc_config):
    """
    Analyze Transit Gateway attachments and identify differences between config and deployment.
    Analyze Transit Gateway route tables and identify differences between config and deployment.

    Args:
        tgw_config: List of Transit Gateway configurations
        tgw_details: List of deployed Transit Gateway details
        vpc_config: VPC configuration from ASEA config

    Returns:
        Dict with lists of attachments and/or tgw route tables not in config and not deployed
    """

    drift = {
        "tgw_attachments_not_in_config": [],
        "tgw_attachments_not_deployed": [],
        "tgw_route_tables_not_in_config": [],
        "tgw_route_tables_not_deployed": []
    }

    # All attachment names from config
    config_att = [vpc["TgwAttachName"]
                  for account in vpc_config.keys() for vpc in vpc_config[account] if vpc["TgwAttachName"]]

    # Check if attachment in the config are deployed
    for att in config_att:
        result = re.search(r"^(.*)_(.*)_att$", att)
        vpc_name, tgw_name = result.groups()
        tgw = next(
            (tgw for tgw in tgw_details if tgw["Name"] == f"{tgw_name}_tgw"), None)
        if tgw is None:
            logger.warning(
                f"Transit Gateway {tgw_name} not found. " +
                "The current version of the script only search for Transit gateways in the home region. " +
                "Transit Gateway attachment {att} exists in config but not deployed")
            drift["tgw_attachments_not_deployed"].append(att)
            continue

        # Check if attachment is associated with VPC
        if att not in [tgwa["Name"] for tgwa in tgw["Attachments"]]:
            logger.warning(
                f"Transit Gateway attachment {att} exists in config but not deployed")
            drift["tgw_attachments_not_deployed"].append(att)
            continue

    # Check if attachments deployed are in the config
    # VPN attachements from the config (i.e. third-party vpn firewall attach) are not detected
    for tgw in tgw_details:
        for tgwc in tgw_config:
            if tgw['Name'] == f"{tgwc['name']}_tgw":
                # check if attachments are in the config
                for attach in tgw["Attachments"]:
                    if attach["Name"] not in config_att:
                        logger.warning(
                            f"Transit Gateway attachment {attach['Name']} exists in {tgw['Name']} but not in config")
                        drift["tgw_attachments_not_in_config"].append(
                            attach["Name"])

    # Check if TGW route tables in the config are deployed
    for tgwc in tgw_config:
        for tgw in tgw_details:
            if tgw['Name'] == f"{tgwc['name']}_tgw":
                if tgwc["route-tables"] is None:
                    continue
                for crt in tgwc["route-tables"]:
                    if f"{tgw['Name']}_{crt}_rt" not in [drt["Name"] for drt in tgw["RouteTables"]]:
                        logger.warning(
                            f"Transit Gateway route table {crt} exists in config but not deployed")
                        drift["tgw_route_tables_not_deployed"].append(crt)

    # Check if TGW route tables deployed are in the config
    for tgw in tgw_details:
        for tgwc in tgw_config:
            if tgw['Name'] == f"{tgwc['name']}_tgw":
                for rt in tgw["RouteTables"]:
                    if rt["Name"] not in [f"{tgw['Name']}_{crt}_rt" for crt in tgwc["route-tables"]]:
                        logger.warning(
                            f"Transit Gateway route table {rt['Name']} exists in {tgw['Name']} but not in config")
                        drift["tgw_route_tables_not_in_config"].append(
                            rt["Name"])

    return drift


def datetime_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def get_unique_regions(config):
    """
    Extract unique regions from ASEA config where resources are deployed
    """
    regions = set()

    # Get regions from VPCs in account configs
    for account in config.get("mandatory-account-configs", {}).values():
        for deployment in account.get("deployments", {}).get("vpc", []):
            if "region" in deployment:
                regions.add(deployment["region"])

    # Get regions from TGWs in shared-network account
    shared_network = config.get(
        "mandatory-account-configs", {}).get("shared-network", {})
    for tgw in shared_network.get("deployments", {}).get("tgw", []):
        if "region" in tgw:
            regions.add(tgw["region"])

    return list(regions)


def main():
    parser = argparse.ArgumentParser(
        prog='lza-upgrade-check',
        usage='%(prog)s [options]',
        description='ASEA to LZA upgrade preparation. Does verifications of drift that can\'t be detected by CloudFormation'
    )
    parser.add_argument(
        "raw_config_path", help="Path to raw ASEA config")
    parser.add_argument('-r', '--role-to-assume',
                        help="Role to assume in each account")
    parser.add_argument('-p', '--accel-prefix',
                        default='ASEA', help="Accelerator Prefix")
    parser.add_argument('-o', '--output-dir', default='outputs',
                        help="Output directory")
    parser.add_argument('--home-region', default='ca-central-1',
                        help="AWS Home Region")

    args = parser.parse_args()

    accel_prefix = args.accel_prefix
    asea_config_path = args.raw_config_path
    output_path = args.output_dir
    role_to_assume = args.role_to_assume if args.role_to_assume else f"{
        accel_prefix}-PipelineRole"
    parameter_table = f"{accel_prefix}-Parameters"
    shared_network_key = 'shared-network'
    home_region = args.home_region

    # Load ASEA config
    with open(asea_config_path) as f:
        config = json.load(f)

    # Get unique regions from config
    regions = get_unique_regions(config)
    logger.info(f"ASEA Config deployed in regions: {regions}")

    # Create output directory if it doesn't exist
    if not os.path.exists(output_path):
        os.makedirs(output_path)

    # Initialize consolidated results
    consolidated_results = {
        "regions": {}
    }

    # Process each region
    for region in regions:
        logger.info(f"Processing region: {region}")

        # Create region-specific output directory
        region_output_path = os.path.join(output_path, region)
        if not os.path.exists(region_output_path):
            os.makedirs(region_output_path)

        # Get accounts config from home region
        accounts = get_accounts_config(parameter_table, home_region)

        # Get VPC config for the specific region
        vpc_config = get_vpcs_from_config(config, region)

        with open(os.path.join(region_output_path, "vpc_config.json"), "w", encoding="utf-8") as f:
            json.dump(vpc_config, f, indent=2,
                      default=datetime_serializer, sort_keys=True)

        # Compare VPC config with environment for the region
        vpc_result = analyze_vpcs(vpc_config, accounts, role_to_assume, region)

        with open(os.path.join(region_output_path, "vpc_inventory.json"), "w", encoding="utf-8") as f:
            json.dump(vpc_result["VpcDetails"], f, indent=2, sort_keys=True)

        # Compare Transit Gateway config for the region
        network_account = get_ec2_client(
            shared_network_key, accounts, role_to_assume, region)

        tgw_config = get_tgw_from_config(config, region)
        tgw_deployed = get_transit_gateway(network_account)
        tgw_result = analyze_tgw(tgw_config, tgw_deployed, vpc_config)

        with open(os.path.join(region_output_path, "tgw_config.json"), "w", encoding="utf-8") as f:
            json.dump(tgw_config, f, indent=2,
                      default=datetime_serializer, sort_keys=True)

        with open(os.path.join(region_output_path, "tgw_inventory.json"), "w", encoding="utf-8") as f:
            json.dump(tgw_deployed, f, indent=2,
                      default=datetime_serializer, sort_keys=True)

        # Store region results
        drift = {
            "SubnetDrift": vpc_result["Drift"],
            "TgwDrift": tgw_result
        }

        with open(os.path.join(region_output_path, "drift.json"), "w", encoding="utf-8") as f:
            json.dump(drift, f, indent=2,
                      default=datetime_serializer, sort_keys=True)

        consolidated_results["regions"][region] = drift

    # Write consolidated results
    with open(os.path.join(output_path, "consolidated_drift.json"), "w", encoding="utf-8") as f:
        json.dump(consolidated_results, f, indent=2,
                  default=datetime_serializer, sort_keys=True)


if __name__ == "__main__":
    main()
