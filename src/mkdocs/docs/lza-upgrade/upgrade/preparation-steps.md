# Preparation steps

Additional preparation steps are recommended depending on your configuration

## Disable Security Hub forwarding to CloudWatch Log Groups

ASEA uses an EventBridge rule and a Lambda function to forward all Security Hub findings to a CloudWatch Log Group in the Security Audit account. The centralized logging architecture then forward all the CloudWatch Log entries to the central S3 bucket. During the LZA installation, a LZA specific EventBridge rule will be deployed to achieve the same outcome. The LZA rule directly targets the CloudWatch Log Group without a Lambda, the process is thus more efficient.

We recommend disabling the EventBridge rule **before** the LZA installation to avoid duplicate findings being delivered. Environments with more than 30 AWS Accounts have experienced timeout issues related to Lambda concurrency rate limiting during the upgrade.

!!! tip
    If you require all findings to be logged in CloudWatch Logs and S3 then you can disable the rule **after** the LZA installation, be advised that you will see duplicate findings being delivered. If there are more than 30 AWS Accounts in the AWS Organization then you would also have to increase the Service Quotas for Lambda [**Concurrent executions**](https://console.aws.amazon.com/servicequotas/home/services/lambda/quotas/L-B99A9384) and CloudWatch Logs [**CreateLogStream throttle limit in transactions per second**](https://console.aws.amazon.com/servicequotas/home/services/logs/quotas/L-76507CEF). In all cases, Security Hub findings will continue to be available in the Security Hub console and through SNS Topics notifications if they are configured, this only affect the delivery of the findings to CloudWatch and S3.

### Disable the EventBridge rule
1. Login to your Management account using an administrative role
2. Assume the privileged role (i.e. `{prefix-name}-PipelineRole`) into the Security Audit account
3. Go to the EventBridge console in the Rules page
4. Locate the `{prefix-name}-SecurityHubFindingsImportToCWLs` rule
5. Disable the rule
6. Repeat this for every AWS Region enabled in your configuration file

Alternatively you can run the following command using AWS Cloud Shell from the Security Audit account to disable the rule in all regions (you need to use the appropriate rule name if using a different accelerator prefix)
```bash
for region in `aws ec2 describe-regions --query "Regions[].RegionName" --output text`; do aws events disable-rule --region $region --name ASEA-SecurityHubFindingsImportToCWLs; done
```

## AWS Security Hub CSPM Configuration

By default AWS Security Hub CSPM is configured as [local configuration](https://docs.aws.amazon.com/securityhub/latest/userguide/local-configuration.html) and is managed by ASEA/LZA for the AWS Organization. AWS Security Hub CSPM introduced [central configuration](https://docs.aws.amazon.com/securityhub/latest/userguide/central-configuration-intro.html) to configure Security Hub CSPM, standards, and controls across multiple organization accounts, organizational units (OUs), and Regions. Currently LZA does not support central configuration and if central configuration was manually implemented then you must revert AWS Security Hub CSPM to local configuration. If you have central configuration enabled at the time of the upgrade, the upgrade will fail at the Security_Audit stage. LZA manages Security Hub CSPM configuration in the [security-config.yaml](https://github.com/aws-samples/landing-zone-accelerator-on-aws-for-cccs-medium/blob/main/config/security-config.yaml) file under the securityHub section.

## Amazon Macie AWS Account Status Check

Deleting an AWS account can cause it to display a **"Removed (disassociated)"** status in Amazon Macie within the Security Audit account. If there are any AWS accounts in this state in any AWS Region the upgrade will fail in the SecurityAudit phase with the following error in CodeBuild logs:

 "CREATE_FAILED | Custom::MacieCreateMember | MacieMembers/Resource/Default (MacieMembers) Received response status [FAILED] from custom resource. Message returned: ValidationException: The request is rejected because the current account cannot delete the given member account ID since it is still associated to it.

To prevent/resolve this issue, follow these steps:
1. Log in to your Security account
2. Navigate to the [Accounts](https://console.aws.amazon.com/macie/home?#/settings/accounts) page in Amazon Macie
3. Locate accounts with **"Removed (disassociated)"** status
4. Delete these accounts from each **AWS Region** individually. **NOTE:** Bulk selection may not successfully remove all accounts
5. Validate the removal by refreshing the page and confirming no accounts show **"Removed (disassociated)"** status

## Configure Interface Endpoints for S3 and DynamoDB (Optional)

### Context
During the upgrade process, LZA creates new route tables and associates them with the existing subnets to replace the previous ASEA route tables. This is mostly transparent as the LZA route tables are identical to the ASEA route tables defined in the ASEA configuration. However, the routes pointing to the prefix list for Gateway Endpoints (S3 and DynamoDB) are only added at a later stage of the upgrade process. Therefore the Gateway Endpoints won't be available from your VPCs between the NetworkVPC stage and PostImportASEAResources stage of the LZA installation. Communication to S3 and DDB will fall back to using the public endpoints going through your Perimeter VPC using the default route. This traffic will be allowed or denied based on your egress rules in the perimeter firewall.

### Workaround
If your workloads cannot tolerate a communication disruption to S3 and DynamoDB, or if they require communication through a Private Endpoint, we recommend temporarily deploying Interface Endpoints for the duration of the upgrade.

!!! warning
    Gateway endpoints are offered at no cost. Interface endpoints have an hourly cost and data transferred through the interface endpoint is charged. This is why we recommended only deploying the S3 and DynamoDB interface endpoint as a temporary measure during the upgrade.

Prior to executing the LZA upgrade

In the Shared Networking account, using the privilege pipeline role

- Create a security group that allows HTTPS from anywhere (0.0.0.0/0)
- Create Interface Endpoints for S3 and DynamoDB in the Endpoint VPC.
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
