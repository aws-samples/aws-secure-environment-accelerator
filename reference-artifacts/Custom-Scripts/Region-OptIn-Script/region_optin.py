import os
import boto3
from botocore.config import Config
import sys
import threading
import argparse
import time

parser = argparse.ArgumentParser(
    description='A development script that enables opt-in regions across all accounts. Use Administrator AWS credentials in the root account when running this script.'
)
parser.add_argument(
    '--OptInRegion',
    help='The opt-in region to enable/disable',
    required=True)
parser.add_argument(
    '--IgnoreOU',
    default='Ignore',
    help='AWS Accounts in this OU will be ignored')
parser.add_argument(
    '--Action',
    default='Enable',
    help='AWS Accounts in this OU will be ignored',
    required=True)

organizations_client = boto3.client('organizations')
account_client = boto3.client('account')
sts = boto3.client('sts')


def get_all_accounts_by_ou(parentId, organizationUnits,
                           organizationUnitsToSkip):
    all_accounts = []
    if parentId is None:
        paginator = organizations_client.get_paginator('list_roots')
        page_iterator = paginator.paginate()
        for root_item in page_iterator:
            item = root_item['Roots'][0]
            if item['Name'] == 'Root' and item['Id'] and item['Arn']:
                parentId = item['Id']
                break

    paginator = organizations_client.get_paginator(
        'list_organizational_units_for_parent')
    page_iterator = paginator.paginate(ParentId=parentId)
    for ous_paged in page_iterator:
        for ou in ous_paged['OrganizationalUnits']:
            if ou['Name'] not in organizationUnitsToSkip:
                all_accounts = all_accounts + \
                    get_accounts_by_parentId(ou['Id'])

    all_accounts = all_accounts + get_accounts_by_parentId(parentId)       

    return all_accounts


def get_accounts_by_parentId(parent_id):
    all_aws_accounts = []
    paginator = organizations_client.get_paginator('list_accounts_for_parent')
    page_iterator = paginator.paginate(ParentId=parent_id)
    for accounts_paged in page_iterator:
        for aws_account in accounts_paged['Accounts']:
            all_aws_accounts.append(aws_account['Id'])
    return all_aws_accounts


def opt_in(region, all_accounts, action):
    print('Opting in accounts for {}'.format(region))

    aws_organziation = organizations_client.describe_organization()

    rootAccountId = aws_organziation['Organization']['MasterAccountId']

    print('Opt-in for {} for management account {} must be done manually first'.format(region, rootAccountId))

    threads = list()
    try:
        count = 0
        for accountId in all_accounts:
            count = count + 1
            if count % 15 == 0:
                for index, thread in enumerate(threads):
                    thread.join()
            if accountId != rootAccountId:
                t = threading.Thread(
                    target=thread_opt_in, args=(
                        region, accountId,action))
                threads.append(t)
                t.start()
    except BaseException:
        print('Error', sys.exc_info()[0], 'occurred')
    finally:
        for index, thread in enumerate(threads):
            thread.join()
        print('Done. All opt in threads finished')


def thread_opt_in(region, accountId,action):
    print('Processing {} for {} in TID={}'.format(
        region, accountId, threading.get_ident()))

    config = Config(
        retries={
            'max_attempts': 3,
            'mode': 'standard'
        }
    )

    account_client_tr = boto3.client('account', config=config)

    region_status = account_client_tr.get_region_opt_status(
        AccountId=accountId, RegionName=region)

    print(
        '{} is {} for {}'.format(
            region_status['RegionName'],
            region_status['RegionOptStatus'],
            accountId))
    
    if action == "status":
        return

    #Enable region if disabled
    if region_status['RegionOptStatus'] == 'DISABLED' and action=="enable":
        print('Enabling {} for {}...'.format(region, accountId))
        try:
            account_client_tr.enable_region(
                AccountId=accountId, RegionName=region)
            status = None
            while status != 'ENABLED':
                time.sleep(5)
                region_status = account_client_tr.get_region_opt_status(
                    AccountId=accountId, RegionName=region)
                status = region_status['RegionOptStatus']
                print(
                    'Status: {} {} for {}'.format(
                        status, region, accountId))
        finally:
            print('Enabling {} for {}. Done'.format(region, accountId))

    #Disable region if enabled

    if region_status['RegionOptStatus'] == 'ENABLED' and action=="disable":
        print('Disabling {} for {}...'.format(region, accountId))
        try:
            account_client_tr.disable_region(
                AccountId=accountId, RegionName=region)
            status = None
            while status != 'DISABLED':
                time.sleep(5)
                region_status = account_client_tr.get_region_opt_status(
                    AccountId=accountId, RegionName=region)
                status = region_status['RegionOptStatus']
                print(
                    'Status: {} {} for {}'.format(
                        status, region, accountId))
        finally:
            print('Disabling {} for {}. Done'.format(region, accountId))


if __name__ == '__main__':
    parser.parse_args()
    args = parser.parse_args()
    all_accounts = get_all_accounts_by_ou(None, [], args.IgnoreOU)
    print ("Action: " + args.Action)
    opt_in(args.OptInRegion, all_accounts, args.Action)
