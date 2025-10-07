# Log Groups Check

This script identifies CloudWatch log groups with 2 subscription filters and counts log group resource policies across all AWS accounts in your organization. This information is useful during ASEA to LZA upgrade preparation to understand the current state of logging configurations.

The script operates by:
1. Retrieving all active accounts from AWS Organizations
2. Assuming a role in each account across specified regions
3. Calling CloudWatch Logs APIs to:
   - Describe all log groups and their subscription filters
   - Count log group resource policies using describe_resource_policies
4. Identifying log groups with 2 subscription filters
5. Generating both console output and JSON files with the results

## Prerequisites

### Python Requirements
- Python 3.9 or later
- Virtual environment setup

#### Setting up the Python Environment

1. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate
```

2. Install required dependencies:
```
pip install -r requirements.txt
```

### AWS Permissions

Required permissions:
- Access to an IAM Role in the ASEA management account
- Permission to list accounts in AWS Organizations
- Ability to assume a role in all AWS accounts containing log groups

Note: While the `ASEA-PipelineRole` satisfies these requirements, it has elevated permissions. We recommend using a least-privilege role with read-only access. See the Sample Policy in the Appendix for the minimum required CloudWatch Logs permissions.

## Usage

Prerequisites:
- Valid credentials for your ASEA management account with Organizations access

Execute the script:
```bash
python log-groups-check.py [options]
```

**WARNING:** For an Organization with a high number of accounts and if checking multiple regions the script can take several minutes to complete.

Configuration options
|Flag|Description|Default|
|----|-----------|-------|
|--accel-prefix|Prefix of your ASEA installation|ASEA|
|--role-to-assume|Role to assume in each account|{accel_prefix}-PipelineRole|
|--regions|List of AWS regions to check (separated by spaces)|ca-central-1|
|--max-workers|Maximum number of parallel workers|10|
|--output-file|Output JSON file path|log-groups-results.json|

The script provides output both in the console and as a JSON file.

## Understanding the Results

### Console Output
The script displays real-time progress as it processes each account-region combination, showing:
- Account name and ID being processed
- Number of log groups found with 2 subscription filters
- Number of log group resource policies found
- Final summary with totals across all accounts

### JSON Output (log-groups-results.json)
The JSON file contains detailed results for each account-region combination with log groups or resource policies:

```json
[
  {
    "accountId": "123456789012",
    "accountName": "Production Account",
    "region": "ca-central-1",
    "logGroups": [
      {
        "logGroupName": "/aws/lambda/my-function",
        "filters": [
          {
            "filterName": "filter1",
            "destinationArn": "arn:aws:logs:ca-central-1:123456789012:destination:my-destination"
          },
          {
            "filterName": "filter2",
            "destinationArn": "arn:aws:kinesis:ca-central-1:123456789012:stream/my-stream"
          }
        ]
      }
    ],
    "resourcePoliciesCount": 3
  }
]
```

### Key Fields
|Field|Description|
|-----|-----------|
|accountId|AWS account ID|
|accountName|AWS account name from Organizations|
|region|AWS region processed|
|logGroups|Array of log groups with exactly 2 subscription filters|
|resourcePoliciesCount|Total number of log group resource policies in the account-region|




## Appendix - Sample Policy

Sample minimal IAM Policy for CloudWatch Logs access:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "CloudWatchLogsReadOnly",
            "Effect": "Allow",
            "Action": [
                "logs:DescribeLogGroups",
                "logs:DescribeSubscriptionFilters",
                "logs:DescribeResourcePolicies"
            ],
            "Resource": "*"
        }
    ]
}
```
