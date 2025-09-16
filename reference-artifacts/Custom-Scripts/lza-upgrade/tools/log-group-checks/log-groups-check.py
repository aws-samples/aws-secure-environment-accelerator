#!/usr/bin/env python3
import argparse
import boto3
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Thread-local storage for progress tracking
thread_local = threading.local()


def get_log_group_resource_policies_count(logs_client):
    """Get count of log group resource policies."""
    try:
        response = logs_client.describe_resource_policies()
        return len(response.get('resourcePolicies', []))
    except Exception as e:
        print(f"Error getting resource policies: {e}")
        return 0


def get_log_groups_filters(logs_client):
    """Fetch all log groups and return the subscription filters."""
    paginator = logs_client.get_paginator('describe_log_groups')
    log_groups_with_two_filters = []

    for page in paginator.paginate():
        for log_group in page['logGroups']:
            log_group_name = log_group['logGroupName']

            try:
                response = logs_client.describe_subscription_filters(
                    logGroupName=log_group_name
                )

                log_groups_with_two_filters.append({
                    'logGroupName': log_group_name,
                    'filters': response['subscriptionFilters']
                })

            except Exception as e:
                print(f"Error getting filters for {log_group_name}: {e}")

    return log_groups_with_two_filters


def get_active_accounts():
    """Get all active accounts from AWS Organizations."""
    print("Fetching active accounts from AWS Organizations...")
    org_client = boto3.client('organizations')
    paginator = org_client.get_paginator('list_accounts')

    active_accounts = []
    for page in paginator.paginate():
        for account in page['Accounts']:
            if account['Status'] == 'ACTIVE':
                active_accounts.append({
                    'Id': account['Id'],
                    'Name': account['Name']
                })

    print(f"Found {len(active_accounts)} active accounts")
    return active_accounts


def assume_role_and_get_logs_client(account_id, role_name, region):
    """Assume role in target account and return logs client."""
    sts_client = boto3.client('sts')

    role_arn = f"arn:aws:iam::{account_id}:role/{role_name}"
    response = sts_client.assume_role(
        RoleArn=role_arn,
        RoleSessionName=f"LogGroupsCheck-{account_id}"
    )

    credentials = response['Credentials']
    return boto3.client(
        'logs',
        region_name=region,
        aws_access_key_id=credentials['AccessKeyId'],
        aws_secret_access_key=credentials['SecretAccessKey'],
        aws_session_token=credentials['SessionToken']
    )


def process_account(account, role_name, region):
    """Process a single account in a specific region and return results."""
    account_id = account['Id']
    account_name = account['Name']

    print(f"Processing: {account_name} ({account_id}) in {region}")

    try:
        logs_client = assume_role_and_get_logs_client(account_id, role_name, region)
        print(f"  {account_name} ({region}): Assumed role successfully, checking log groups...")

        log_groups = get_log_groups_filters(logs_client)
        resource_policies_count = get_log_group_resource_policies_count(logs_client)

        # count log groups that have two subscription filters
        log_groups_with_two_filters_count = sum(1 for log_group in log_groups if len(log_group['filters']) == 2)

        print(f"  {account_name} ({region}): Found {log_groups_with_two_filters_count} log groups with 2 subscription filters")
        print(f"  {account_name} ({region}): Found {resource_policies_count} log group resource policies")

        return {
            'accountId': account_id,
            'accountName': account_name,
            'region': region,
            'resourcePoliciesCount': resource_policies_count,
            'logGroupsWithTwoFiltersCount': log_groups_with_two_filters_count,
            'logGroups': log_groups
        }

    except Exception as e:
        print(f"  {account_name} ({region}): Error - {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        prog='log-groups-check',
        usage='%(prog)s [options]',
        description='Check for log groups with exactly 2 subscription filters across AWS accounts'
    )
    parser.add_argument('-r', '--role-to-assume',
                        help="Role to assume in each account")
    parser.add_argument('-p', '--accel-prefix',
                        default='ASEA', help="Accelerator Prefix")
    parser.add_argument('--regions', nargs='+',
                        default=['ca-central-1'], help="AWS regions to check")
    parser.add_argument('--max-workers', type=int, default=10,
                        help="Maximum number of parallel workers")
    parser.add_argument('-o', '--output-file', default='log-groups-results.json',
                        help="Output JSON file path")

    args = parser.parse_args()

    role_name = args.role_to_assume if args.role_to_assume else f"{args.accel_prefix}-PipelineRole"
    regions = args.regions
    max_workers = args.max_workers

    accounts = get_active_accounts()
    all_results = []

    # Create account-region combinations
    account_region_pairs = [(account, region) for account in accounts for region in regions]

    print(f"\nProcessing {len(accounts)} accounts across {len(regions)} regions ({len(account_region_pairs)} total combinations) with {max_workers} parallel workers...")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all account-region processing tasks
        future_to_pair = {
            executor.submit(process_account, account, role_name, region): (account, region)
            for account, region in account_region_pairs
        }

        # Collect results as they complete
        for future in as_completed(future_to_pair):
            try:
                result = future.result()
            except Exception as e:
                account, region = future_to_pair[future]
                print(f"  {account['Name']} ({region}): Failed to process - {e}")
                result = None
            if result:
                all_results.append(result)

    # Save results to JSON file
    with open(args.output_file, 'w') as f:
        json.dump(all_results, f, indent=2)

    # Final report
    total_log_groups = sum(len(result['logGroups']) for result in all_results)
    total_resource_policies = sum(result['resourcePoliciesCount'] for result in all_results)
    print("\nProcessing complete!")
    print(f"Results saved to: {args.output_file}")
    print(f"\nFinal Report: {total_log_groups} log groups across {len(all_results)} account-region combinations")
    print(f"Total resource policies: {total_resource_policies}")
    print("=" * 80)

    for result in all_results:
        if result['logGroupsWithTwoFiltersCount'] > 0 or result['resourcePoliciesCount'] > 8:
            print(f"\nAccount: {result['accountName']} ({result['accountId']}) - Region: {result['region']}")
            print(f"Resource policies: {result['resourcePoliciesCount']}")
            print(f"Log Groups with 2 filters: {result['logGroupsWithTwoFiltersCount']}")

            for lg in result['logGroups']:
                if len(lg['filters']) >= 2:
                    print(f"  • {lg['logGroupName']}")
                    for i, filter_info in enumerate(lg['filters'], 1):
                        print(f"    Filter {i}: {filter_info['filterName']} -> {filter_info['destinationArn']}")


if __name__ == "__main__":
    main()
