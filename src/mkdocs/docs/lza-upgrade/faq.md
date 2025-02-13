# FAQ

## Does the upgrade affect availability of the workloads in the Landing Zone?

The upgrade is designed to be as transparent and automated as possible. Only resources initially deployed by ASEA are touched during the upgrade, any resources deployed outside the accelerator and in workloads accounts are not impacted during the upgrade.

Changes to the shared networking resources managed by the accelerator can have an impact on the availability of workloads using the shared VPCs and perimeter resources. During the upgrade process, LZA creates new route tables and NACLs and associates them with the existing subnets to replace the previous ASEA route tables and NACLs. We recommend customers plan for a one to two minute network disruption for the traffic going through the Perimeter VPC.

- The LZA route table and NACLs are re-created based on the ASEA configuration. It is critical to identify drift or any manual modifications done to these resources prior to the upgrade.
- When the route tables are replaced in the NetworkVPC stage of the LZA installation, minimal packet loss (i.e. few seconds) can be observed. This affect all traffic going through the Transit Gateway.
- For deployments using AWS Network Firewall, the routes targeting the network firewall endpoints are re-created in the NetworkVpcEndpointsStack that is deployed immediately after the NetworkVPCStack. This cause a network disruption of all ingress/egress traffic going through the Perimeter VPC between 1 and 2 minutes.
- For deployments using third-party Firewalls (i.e. FortiGate), the routes targeting the firewall ENIs are re-created in the NetworkAssociationsGwlbStack. This doesn't affect workload traffic flowing through the firewalls but can impact connectivity to the firewall management interface.
- There is a period between the **NetworkVPC** and **PostImportASEAResources** stages where route tables to VPC Gateway Endpoints for S3 and DynamoDB are not available. See the section on [Optional preparation steps](./upgrade/optional-steps.md#configure-interface-endpoints-for-s3-and-dynamodb) for more details and recommended workaround.

## What if we made manual changes to subnet route tables outside the accelerator?

As detailed in the previous entry, LZA creates new route tables and NACLs based on the ASEA configuration and associates them with the existing subnets to replace the ASEA route tables and NACLs. Any changes made to subnet route tables outside the accelerator will be reverted during the upgrade.

The preferred resolution is to align the ASEA configuration to incorporate the manual changes in ASEA before the upgrade to remove the drift.

If this is not possible, you should record all route table information before the upgrade to identify manually created entries. After the upgrade is complete, these entries need to be recreated.

Note: Transit Gateway route tables are not replaced during the upgrade, theses guidelines only apply to subnet route tables.

!!! tip
    There is a script available to help detect drift on networking resources that are not detected by CloudFormation. The script is available in the [tools/network-drift-detection](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/main/reference-artifacts/Custom-Scripts/lza-upgrade/tools/network-drift-detection/) folder in the ASEA to LZA upgrade tools.


## Gateway Load Balancer are not supported in the configuration conversion, how will this impact the workload availability?

As covered in the [Feature specific considerations](./comparison/feature-specific-considerations.md#gateway-load-balancer) section, the configuration tool will not map the existing GWLB in ASEA to the LZA configuration. The already deployed firewall instances and Gateway Load Balancer endpoints will remain untouched. However, you should carefully review the route tables to confirm if the entries sending traffic to the GWLB Endpoints will be properly configured when LZA re-creates the subnet route tables.

Review the related route table entries in the network-config.yaml file and compare the entries with the entries of the route tables currently deployed in your environment. Make the necessary modifications in network-config.yaml to match the current configuration. Reference the [RouteTableEntryConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/interfaces/___packages__aws_accelerator_config_lib_models_network_config.IRouteTableEntryConfig.html) documentation for more details on how to configure route tables in LZA.

In this scenario you won't be able to use the `gatewayLoadBalancerEndpoint` destination type to reference a GWLB that was not deployed by LZA. As an alternative you can use the `networkInterface` type to directly reference the ENIs of the GWLB endpoints. Please note, that the LZA route tables are created and associated in the NetworkVPC stack, but the route entries of type `networkInterface` are created in the NetworkAssociations stack which is triggered later in the pipeline, resulting in a period of time where the route entries will be missing.

Another alternative is to manually add the missing route entries to the LZA route tables as soon as the NetworkVPC stage completes to minimize network downtime.


## Do you recommend to have specific monitoring in place for the upgrade?

We highly recommend that you monitor the availability of all your workloads deployed in the Landing Zone as well as the main network flows to be alerted of any impact during the upgrade process.

Example of important network flows to monitor:

- Ingress traffic from Internet to workloads through Perimeter
- Egress traffic from workloads to Internet through Perimeter
- Ingress and egress traffic between on-premises networks and AWS VPCs (i.e. Direct Connect or VPN)
- East-West traffic between your VPCs through Transit Gateway

You can use [CloudWatch Network Synthetic Monitor](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/what-is-network-monitor.html) and [CloudWatch Synthetics (Canaries)](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Canaries.html) in combination with CloudWatch Alarms to setup monitoring of the important network flows and of your applications.


## Why does CloudTrail configuration show as disabled in the LZA configuration files?

The convert-config tool generates a configuration block in `global-config.yaml` with CloudTrail showed as disabled.

```
logging:
  account: LogArchive
  centralizedLoggingRegion: ca-central-1
  cloudtrail:
    enable: false
    organizationTrail: false

```

This is because for upgraded environment, there is already an existing organizational trail configured by ASEA or ControlTower that will continue to be used. We don't recommend changing this to `true` as this will instruct LZA to create a new trail in addition to the existing one created by ASEA.

## Which Service Quotas should be monitored for the upgrade?

Depending on your configuration, the LZA installation can create over 500 IAM Roles in each account. If you already have several IAM Roles in your accounts and using the default limit of 1000, the installation could be blocked by this service quota.

You can make an AWS Config query using the organization aggregator to list the current number of IAM Roles in each account, and request a limit increase proactively.
```
SELECT
  accountId,
  COUNT(*)
WHERE
  resourceType = 'AWS::IAM::Role'
GROUP BY
  accountId
ORDER BY
  COUNT(*) DESC
```

For more information about LZA related Quotas, refer to the [LZA Documentation about Quotas](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/quotas.html) as well as this note about [CodeBuild concurrency](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html#update-codebuild-conncurrency-quota)