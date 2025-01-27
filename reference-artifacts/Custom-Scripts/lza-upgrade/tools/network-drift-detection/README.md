# Network Drift Detection

This script supplements the CloudFormation drift detection step during the ASEA to LZA upgrade preparation phase. It performs additional comparisons between the ASEA configuration file and the current state of VPC resources.

The script operates by:
1. Reading the raw ASEA configuration file to identify all defined VPCs
2. Calling EC2 APIs to describe:
   - VPCs
   - Subnets
   - Route tables
   - Transit Gateways
   - Transit Gateway Attachments
   - Transit Gateway Route Tables
3. Comparing the current state with the configuration
4. Generating JSON files that identify configuration drift and document the current state of resources for reference during the upgrade process


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
- Permission to read the ASEA-Parameters DynamoDB Table
- Ability to assume a role in all AWS accounts containing ASEA-deployed networking resources

Note: While the `ASEA-PipelineRole` satisfies these requirements, it has elevated permissions. We recommend using a least-privilege role with read-only access. See the Sample Policy in the Appendix for the minimum required EC2 permissions.

## Usage

Prerequisites:
- Valid credentials for your ASEA management account
- Local copy of the raw ASEA raw/config.json configuration file from your CodeCommit repository

Execute the script:
```bash
python lza-upgrade-check.py <path_to_raw_ASEA_config> [options]
```

Configuration options
|Flag|Description|Default|
|----|-----------|-------|
|--accel-prefix|Prefix of your ASEA installation|ASEA|
|--home-region|Your AWS Home Region|ca-central-1|
|--role-to-assume|Role to assume in each account|{accel_prefix}-PipelineRole|
|--output-dir|Local directory where to save the output|outputs|

The script provides output both in the console and as files in the specified output directory.

## Understanding the Results

### Drift Analysis (consolidate_drift.json)
This file documents differences between the ASEA configuration and the current state of AWS networking resources.

#### Subnet Drift Analysis
This section details drift in subnets and their route tables. Careful inspection is required as LZA will create and replace route tables based on the ASEA configuration during the upgrade.

|Key|Description|Notes and upgrade impact|
|---|-----------|------------------------|
|route_table_entries_mismatches|Difference in route entries between ASEA config and AWS account|Route entries may have been modified manually, **the changes will be overwritten during the upgrade**. Note: the script doesn't handle all route target types, manual verification is still recommended|
|route_tables_not_deployed|Route tables found in the ASEA config, but not in the AWS account|These route tables may have been manually removed and **will be re-created during the upgrade**|
|route_tables_not_in_config|Route tables not found in the ASEA config, but are present in the AWS account|This is for information, these route tables won't be modified during the upgrade. See note below.|
|subnet_route_table_mismatches|There is a configuration difference between the ASEA config and the current state of the route table|These route tables may have been manually modified, **the changes will be overwritten during the upgrade**|
|subnets_not_associated|The association between subnet and route table is different between ASEA config and in the AWS account|A different route table may have been manually associated with a subnet. **The association will be reverted during the upgrade**|
|subnets_not_deployed|Subnet not found in the ASEA config, but are present in the AWS account|This is for information, these subnets won't be modified during the upgrade|
|vpcs_not_in_config|VPC not found in the ASEA config, but are present in the AWS account|This is for information, these VPC won't be modified during the upgrade|

Note: The script will probably output one route table per VPC with only the route table identifier as a reference (e.g. `Route table rtb-xxxxxxxxxx exists in VPC Central_vpc but not in config`). Those are more likely the default route tables that were automatically created at VPC creation, this can be ignored as long as those default route tables are not associated to any subnet.

#### Transit Gateway Drift Analysis
This section details drift in Transit Gateway Attachments and Route Tables. These changes are primarily informational, highlighting modifications made outside the accelerator. During the upgrade, existing TGW attachments and route tables remain unmodified. We strongly recommend reviewing these changes both before and after the upgrade to prevent unexpected impacts.

|Key|Description|
|---|-----------|
|tgw_attachments_not_deployed|TGW attachments present in ASEA config but missing from AWS account|
|tgw_attachments_not_in_config|TGW attachments present in AWS account but not in ASEA config|
|tgw_route_tables_not_deployed|TGW route tables present in ASEA config but missing from AWS account|
|tgw_route_tables_not_in_config|TGW route tables present in AWS account but not in ASEA config|

### Resource Inventory
The script generates inventory files documenting the current state of resources. These files can be used as a reference for the current state of resources before the upgrade. One sub-directory will be created in the output folder for each region where you have networking resources deployed.

|File Name|Description|
|---------|-----------|
|tgw_config.json|Summary of Transit Gateway configuration from ASEA|
|tgw_inventory.json|Detailed Transit Gateway resource state, including raw API responses|
|vpc_config.json|Summary of VPC, Subnet, and Route Table configurations from ASEA|
|vpc_inventory.json|Detailed state of VPC resources, including raw API responses|

## Limitations

This script assists in identifying drift and manual modifications outside the accelerator. However, it should not replace a comprehensive analysis of your landing zone networking configuration.

Current limitations:
- Tested only with sample ASEA configurations; may not support all customizations


## Appendix - Sample policy

Sample minimal IAM Policy to describe networking resources

```
{
    "Version": "2012-10-17",
    "Statement":
    [
        {
            "Sid": "Ec2ViewOnly",
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeAccountAttributes",
                "ec2:DescribeAddresses",
                "ec2:DescribeAvailabilityZones",
                "ec2:DescribeCarrierGateways",
                "ec2:DescribeClassicLinkInstances",
                "ec2:DescribeCustomerGateways",
                "ec2:DescribeDhcpOptions",
                "ec2:DescribeFlowLogs",
                "ec2:DescribeInternetGateways",
                "ec2:DescribeLocalGatewayRouteTableVirtualInterfaceGroupAssociations",
                "ec2:DescribeLocalGatewayRouteTableVpcAssociations",
                "ec2:DescribeLocalGatewayRouteTables",
                "ec2:DescribeLocalGatewayVirtualInterfaceGroups",
                "ec2:DescribeLocalGatewayVirtualInterfaces",
                "ec2:DescribeLocalGateways",
                "ec2:DescribeMovingAddresses",
                "ec2:DescribeNatGateways",
                "ec2:DescribeNetwork*",
                "ec2:DescribePrefixLists",
                "ec2:DescribeRegions",
                "ec2:DescribeReserved*",
                "ec2:DescribeRouteTables",
                "ec2:DescribeSecurityGroupRules",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeSubnets",
                "ec2:DescribeTags",
                "ec2:DescribeVpc*",
                "ec2:DescribeVpnGateways",
                "ec2:DescribeVpnConnections",
                "ec2:SearchLocalGatewayRoutes",
                "ec2:DescribeTransitGateway*",
                "ec2:GetTransitGatewayRouteTableAssociations",
                "ec2:GetTransitGatewayRouteTablePropagations",
                "ec2:GetTransitGatewayPrefixListReferences",
                "ec2:SearchTransitGatewayRoutes"
            ],
            "Resource": "*"
        }
    ]
}
```