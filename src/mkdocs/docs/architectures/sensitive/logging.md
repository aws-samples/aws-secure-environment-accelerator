# 1. Logging and Monitoring

## 1.1. Overview

The _AWS Secure Environment Accelerator Architecture_ requires the following security services be deployed across the organization. These services, taken together, provide a comprehensive picture of the security posture of the organization.

## 1.2. CloudTrail

The AWS CloudTrail service provides a comprehensive log of control plane and data plane operations (audit history) of all actions taken against most AWS services, including users logging into accounts. A CloudTrail Organizational trail should be deployed into the organization. For each account, this captures management events and optionally S3 data plane events taking place by every principal in every account in the organization. These records are sent to both a CloudWatch log group in the Organization Management account and an S3 bucket in the Log Archive account. The trail itself cannot be modified or deleted by any principal in any child account. This provides an audit trail for detective purposes in the event of the need for forensic analysis into account usage. The logs themselves provide an integrity guarantee: every hour, CloudTrail produces a digest of that hour’s log files, with a hash, and signs it with its own private key. This makes it computationally infeasible to modify, delete or forge CloudTrail log files without detection. This process is [detailed here][ct-digest]. The Log Archive bucket is protected with SCPs and has versioning enabled ensuring deleted or overwritten files are retained.

## 1.3. VPC Flow Logs

VPC Flow Logs capture information about the IP traffic going to and from network interfaces in an AWS Account VPC such as source and destination IPs, protocol, ports, and success/failure of the flow. The _AWS Secure Environment Accelerator Architecture_ enables ALL (i.e. both accepted and rejected traffic) logs for all VPCs in all accounts in both a local CloudWatch log group and an S3 bucket in the log-archive account. It is important to use custom flow log formats to ensure all fields are captured as important fields are not part of the basic format. More details about VPC Flow Logs are [available here][flow].

It should be noted that certain categories of network flows are not captured, including traffic to and from the instance metadata service (`169.254.169.254`), and DNS traffic with an Amazon VPC resolver (available in DNS resolver logs).

## 1.4. GuardDuty

Amazon GuardDuty is a cloud native threat detection and Intrusion Detection Service (IDS) that continuously monitors for malicious activity and unauthorized behavior to protect your AWS accounts and workloads. The service uses machine learning, anomaly detection, and integrated threat intelligence to identify and prioritize potential threats. GuardDuty uses a number of data sources including VPC Flow Logs, DNS logs, CloudTrail logs and several threat feeds.

The _AWS Secure Environment Accelerator Architecture_ requires GuardDuty be enabled [at the Organization level][gd-org], and delegating the Security account as the GuardDuty Administrative account. The GuardDuty Administrative account should be auto-enabled to add new accounts as they come online. Note that this should be done in every region as a defense in depth measure, with the understanding that the SCPs will prevent service usage in all other regions.

## 1.5. Config

[AWS Config][config] provides a detailed view of the resources associated with each account in the AWS Organization, including how they are configured, how they are related to one another, and how the configurations have changed on a recurring basis. Resources can be evaluated on the basis of their compliance with Config Rules - for example, a Config Rule might continually examine EBS volumes and check that they are encrypted.

Config may be [enabled at the Organization][config-org] level - this provides an overall view of the compliance status of all resources across the organization. The AWS Config multi-account multi-region data aggregation capability has been located in both the Organization Management account and the Security account.

## 1.6. CloudWatch Logs

CloudWatch Logs is AWS’ log aggregator service, used to monitor, store, and access log files from EC2 instances, AWS CloudTrail, Route 53, and other sources. The _AWS Secure Environment Accelerator Architecture_ requires that log subscriptions are created for all log groups in all workload accounts, and streamed into S3 in the log-archive account (via Kinesis) for analysis and long-term audit purposes. The CloudWatch log group retention period on all log groups should be set to a medium retention period (such as 2 years) to enable easy online access.

## 1.7. SecurityHub

The primary dashboard for Operators to assess the security posture of the AWS footprint is the centralized AWS Security Hub service. Security Hub needs to be configured to aggregate findings from Amazon GuardDuty, Amazon Macie, AWS Config, Systems Manager, Firewall Manager, Amazon Detective, Amazon Inspector and IAM Access Analyzers. Events from security integrations are correlated and displayed on the Security Hub dashboard as ‘findings’ with a severity level (informational, low, medium, high, critical).

The AWS Secure Environment Accelerator Architecture recommends that the current 3 Security Hub frameworks be enabled, specifically:

-   [AWS Foundational Security Best Practices v1.0.0][found]
-   [PCI DSS v3.2.1][pci]
-   [CIS AWS Foundations Benchmark v1.2.0][cis]

These frameworks will perform checks against the accounts via Config Rules that are evaluated against the AWS Config resources in scope. See the above links for a definition of the associated controls.

## 1.8. Systems Manager Session Manager

Session Manager is a fully managed AWS Systems Manager capability that lets you manage your Amazon Elastic Compute Cloud (Amazon EC2) instances, on-premises instances, and virtual machines (VMs) through an interactive one-click browser-based shell or through the AWS Command Line Interface (AWS CLI). Session Manager provides secure and auditable instance management without the need to open inbound ports, maintain bastion hosts, or manage SSH keys. Session Manager also makes it easy to comply with corporate policies that require controlled access to instances, strict security practices, and fully auditable logs with instance access details, while still providing end users with simple one-click cross-platform access to your managed instances.<sup>[1][ssm]</sup>

The _AWS Secure Environment Accelerator Architecture_ stores encrypted session log data in both CloudWatch logs and in the centralized S3 bucket for auditing purposes.

## 1.9. Systems Manager Inventory

AWS Systems Manager Inventory provides visibility into your AWS computing environment. AWS ASEA architecture uses SSM Inventory to collect metadata from your managed nodes and stores this metadata in the central Log Archive S3 bucket. These logs enable customers to quickly determine which nodes are running the software and configurations required by your software policy, and which nodes need to be updated.

## 1.10. Other Services

The following additional services are configured with their organization-wide administrative and visibility capabilities centralized to the Security account: Macie, Firewall Manager, Access Analyzer. The following additional logging and reporting services are configured: CloudWatch Alarms, Cost and Usage Reports, rsyslog, MAD, R53 logs, OS/App, ELB, OpenSearch SIEM.

[pbmm]: https://www.canada.ca/en/government/system/digital-government/modern-emerging-technologies/cloud-services/government-canada-security-control-profile-cloud-based-it-services.html#toc4
[ops_guide]: https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/docs/operations/index.md
[dev_guide]: https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/docs/developer/developer-guide.md
[accel_tool]: https://github.com/aws-samples/aws-secure-environment-accelerator/blob/main/README.md
[aws_org]: https://aws.amazon.com/organizations/
[aws_scps]: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_type-auth.html#orgs_manage_policies_scp
[aws_vpn]: https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html
[aws_dc]: https://aws.amazon.com/directconnect/
[aws_vpc]: https://aws.amazon.com/vpc/
[aws_tgw]: https://aws.amazon.com/transit-gateway/
[aws_r53]: https://aws.amazon.com/route53/
[ssm_endpoints]: https://aws.amazon.com/premiumsupport/knowledge-center/ec2-systems-manager-vpc-endpoints/
[1918]: https://tools.ietf.org/html/rfc1918
[6598]: https://tools.ietf.org/html/rfc6598
[root]: https://docs.aws.amazon.com/general/latest/gr/aws_tasks-that-require-root.html
[iam_flow]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
[scps]: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps-about.html
[ct-digest]: https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html
[ebs-encryption]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html#encryption-by-default
[s3-block]: https://docs.aws.amazon.com/AmazonS3/latest/dev/access-control-block-public-access.html#access-control-block-public-access-options
[flow]: https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html
[gd-org]: https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
[config]: https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html
[config-org]: https://docs.aws.amazon.com/organizations/latest/userguide/services-that-can-integrate-config.html
[found]: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-standards-fsbp-controls.html
[pci]: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-pci-controls.html
[cis]: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cis-controls.html
[ssm]: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
