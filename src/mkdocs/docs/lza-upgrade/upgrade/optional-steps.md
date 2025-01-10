# Optional preparation steps

Additional preparation steps are recommended depending on your configuration

## Configure Interface Endpoints for S3 and DynamoDB

### Context
During the upgrade process, LZA creates new route tables and associates them with the existing subnets to replace the previous ASEA route tables. This is mostly transparent as the LZA route tables are identical to the ASEA route tables defined in the ASEA configuration. However, the routes pointing to the prefix list for Gateway Endpoints (S3 and DynamoDB) are only added at a later stage of the upgrade process. Therefore the Gateway Endpoints won't be available from your VPCs between the NetworkVPC stage and PostImportASEAResources stage of the LZA installation. Communication to S3 and DDB will fall back to using the public endpoints going through your Perimeter VPC using the default route. This traffic will be allowed or denied based on your egress rules in the perimeter firewall.

### Workaround
If your workloads cannot tolerate a communication disruption to S3 and DynamoDB, or if they require communication through a Private Endpoint, we recommend temporarily deploying Interface Endpoints for the duration of the upgrade.

!!! warning
    Gateway endpoints are offered at no cost. Interface endpoints have an hourly cost and data transferred through the interface endpoint is charged. This is why we recommended only deploying the S3 and DynamoDB interface endpoint as a temporary measure during the upgrade.

Prior to executing the LZA upgrade

- In the Shared Networking account, create Interface Endpoints for S3 and DynamoDB in the Endpoint VPC.
    - Create a security group that allows HTTPS from anywhere (0.0.0.0/0)
    - For S3
        - Do not select the option "Enable DNS Name"
        - Select the security group previously created
    - For DynamoDB
        - Do not select the option "Enable DNS Name"
        - Select the security group previously created
- Go to **Route 53** and create a Private Hosted Zones for the endpoints.
    - For S3
        - Domain name: s3.ca-central-1.amazonaws.com (adjust as needed based on your region)
        - Type: Private hosted zone
        - VPCs to associate with the hosted zone: Select only the Endpoint_vpc for now
        - Add records to the Private Hosted Zone
              - 1) Create top-level A record
                  - Subdomain: (Leave empty)
                  - Record Type: A
                  - Alias: Selected
                  - Route traffic to: Alias to VPC Endpoint
                  - Select the S3 endpoint previously created
              - 2) Create wildcard A record
                  - Subdomain: *
                  - Record Type: A
                  - Alias: Selected
                  - Route traffic to: Alias to VPC Endpoint
                  - Select the S3 endpoint previously created
        - Once the record is created, edit the hosted zone and associate it with all your VPC (Dev, Test, Prod, Central)
    - For DynamoDB
        - Domain name: dynamodb.ca-central-1.amazonaws.com (adjust as needed based on your region)
        - Type: Private hosted zone
        - VPCs to associate with the hosted zone: Select only the Endpoint_vpc for now
        - Add record to the Private Hosted Zone
            - Subdomain: (Leave empty)
            - Record Type: A
            - Alias: Selected
            - Route traffic to: Alias to VPC Endpoint
            - Select the DynamoDB endpoint previously created
        - Once the record is created, edit the hosted zone and associate it with all your VPC (Dev, Test, Prod, Central)

!!! tip
    If you have VPCs deployed locally in workload accounts outside of the shared-network account (i.e. Spoke VPC topology) you will need to create this association using the AWS CLI, SDK or API. Refer to the documentation on [Associating an Amazon VPC and a private hosted zone that you created with different AWS accounts](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zone-private-associate-vpcs-different-accounts.html)

#### Removal of endpoints after the LZA installation
Once LZA upgrade is complete

- Confirm that Gateway Endpoints are associated with the route tables of your subnets
- Remove the S3 and DynamoDB Private Hosted Zones and Interface Endpoints that were previously created by doing the steps in reverse order:
    - Un-associate the Private Hosted Zone from all VPCs except Endpoint_vpc
    - Remove all record from the zone except the SOA and NS records
    - Delete the Private Hosted Zone
    - Delete the Interface endpoint (don't delete the Gateway endpoints)

## Disable Security Hub forwarding to CloudWatch Log Groups

ASEA uses an Event Bridge rule and a Lambda function to forward all Security Hub findings to a CloudWatch Log Group in the Security Audit account. The centralized logging architecture then forward all the CloudWatch Log entries to the central S3 bucket. During the LZA installation, a LZA specific Event Bridge rule will be deployed to achieve the same outcome. The LZA rule directly targets the CloudWatch Log Group without a Lambda, the process is thus more efficient.

We recommend disabling the Event Bridge rule **before** the LZA installation to avoid duplicate findings being delivered. On large environments, timeout issues related to Lambda rate limiting have been reported during the upgrade.

!!! tip
    If you require all findings to be logged in CloudWatch Logs and S3 we recommend you instead disable the rule **after** the LZA installation, be advised that you will see duplicate findings being delivered. In all cases, Security Hub findings will continue to be available in the Security Hub console and through SNS Topics notifications if they are configured, this only affect the delivery of the findings to CloudWatch and S3.

### Disable the Event Bridge rule
1. Login to your Management account using an administrative role
2. Assume the privileged role (i.e. `{prefix-name}-PipelineRole`) into the Security Audit account
3. Go to the Event Bridge console in the Rules page
4. Locate the `{prefix-name}-SecurityHubFindingsImportToCWLs` rule
5. Disable the rule
6. Repeat this for every AWS Region enabled in your configuration file

Alternatively you can run the following command using AWS Cloud Shell from the Security Audit account to disable the rule in all regions (you need to use the approriate rule name if using a different accelerator prefix)
```bash
for region in `aws ec2 describe-regions --query "Regions[].RegionName" --output text`; do aws events disable-rule --region $region --name ASEA-SecurityHubFindingsImportToCWLs; done
```
