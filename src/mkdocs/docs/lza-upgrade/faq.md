# FAQ

## Does the upgrade affect availability of the workloads in the Landing Zone?

The upgrade is designed to be as transparent and automated as possible. Only resources initially deployed by ASEA are touched during the upgrade, any resources deployed outside the accelerator and in workloads accounts are not impacted during the upgrade.

Changes to the shared networking resources managed by the accelerator can have an impact on the availability of workloads using the shared VPCs and perimeter resources. During the upgrade process, LZA creates new route tables and NACLs and associates them with the existing subnets to replace the previous ASEA route tables and NACLs. We recommend customers plan for a one to two minute network disruption for the traffic going through the Periemetr VPC.

- The LZA route table and NACLs are re-created based on the ASEA configuration. It is critical to identify drift or any manual modifications done to these resources prior to the upgrade.
- When the route tables are replaced in the NetworkVPC stage of the LZA installation, minimal packet loss (i.e. few seconds) can be observed. This affect all traffic going through the Transit Gateway.
- For deployments using AWS Network Firewall, the routes targetting the network firewall endpoints are re-created in the NetworkVpcEndpointsStack that is deployed immediatly after the NetworkVPCStack. This cause a network disruption of all ingress/egress traffic going through the Perimeter VPC between 1 and 2 minutes.
- For deployments using third-party Firewalls (i.e. Fortigate), the routes targetting the firewall ENIs are re-created in the NetworkAssociationsGwlbStack. This doesn't affect workload traffic flowing through the firewalls but can impact connectivity to the firewall management interface.
- There is a period between the **NetworkVPC** and **PostImportASEAResources** stages where route tables to VPC Gateway Endpoints for S3 and DynamoDB are not available. See the section on [Optional preparation steps](./upgrade/optional-steps.md#configure-interface-endpoints-for-s3-and-dynamodb) for more details and recommended workaround.


## Do you recommend to have specific monitoring in place for the upgrade?

We highly recommend that you monitor the availability of all your workloads deployed in the Landing Zone as well as the main network flows to be alerted of any impact during the upgrade process.

Example of important network flows to monitor:

- Ingress traffic from Internet to workloads through Perimeter
- Egress traffic from workloads to Internet through Perimeter
- Ingress and agress traffic between on-premises networks and AWS VPCs (i.e. Direct Connect or VPN)
- East-West traffic netween your VPCs through Transit Gateway

You can use [CloudWatch Network Synthetic Monitor](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/what-is-network-monitor.html) [CloudWatch Synthetics (Canaries)](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Canaries.html) in combination with CloudWatch Alarms to setup monitoring of the important network flows and your applications.


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