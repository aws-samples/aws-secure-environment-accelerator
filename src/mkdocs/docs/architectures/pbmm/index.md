# 1. AWS Secure Environment Accelerator PBMM Architecture

## 1.1. Overview

The _AWS Secure Environment PBMM Architecture_ is a comprehensive, multi-account AWS cloud architecture, initially designed for use within the Government of Canada for [PBMM workloads][pbmm]. The _AWS Secure Environment PBMM Architecture_ has been designed to address central identity and access management, governance, data security, comprehensive logging, and network design/segmentation per Canadian Centre for Cyber Security ITSG-33 specifications (a NIST 800-53 variant).

This document specifically does NOT talk about the tooling or mechanisms that can be used to deploy the architecture. While the AWS Secure Environment Accelerator (SEA) is one tool capable of deploying this architecture (along with many other architectures), customers can use whatever mechanism they deem appropriate to deploy it. This document does not discuss the AWS SEA tooling or architecture and is strictly focused on the resulting deployed solution created by using the provided sample PBMM Accelerator configuration file. This architecture document should stand on its own in depicting the `deployed` architecture. Users looking for information on the SEA tooling itself, should refer to the other SEA documents.

It is anticipated we will offer multiple sample architectures with the AWS SEA solution, each having its own architecture document like this. As the SEA can produce hundreds of solutions, it does not make sense to repeat that content in this document.

## 1.2. Introduction

The _AWS Secure Environment Architecture_ has been built with the following design principles:

1. Maximize agility, scalability, and availability
2. Enable the full capability of the AWS cloud
3. Be adaptable to evolving technological capabilities in the underlying platform being used in the _AWS Secure Environment Architecture_
4. Allow for seamless auto-scaling and provide unbounded bandwidth as bandwidth requirements increase (or decrease) based on actual customer load (a key aspect of the value proposition of cloud computing)
5. Design for high availability: the design stretches across two physical AWS Availability Zones (AZ), such that the loss of any one AZ does not impact application availability. The design can be easily extended to a third availability zone.
6. Operate as least privilege: all principals in the accounts are intended to operate with the lowest-feasible permission set.

### 1.2.1. Purpose of Document

This document is intended to outline the technical measures that are delivered by the _AWS Secure Environment Architecture_ that make it suitable for PBMM workloads. An explicit **non-goal** of this document is to explain the delivery architecture of the [AWS Secure Environment Accelerator tool][accel_tool] itself, an open-source software project built by AWS.

While the central purpose of the [AWS Secure Environment Accelerator][accel_tool] is to establish an _AWS Secure Environment Architecture_ into an AWS account footprint, this amounts to an implementation detail as far as the _AWS Secure Environment Architecture_ is concerned. The _AWS Secure Environment Architecture_ is a standalone design, irrespective of how it was delivered into a customer AWS environment. It is nonetheless anticipated that most customers will choose to realize their _AWS Secure Environment Architecture_ via the delivery mechanism of the [AWS Secure Environment Accelerator tool][accel_tool].

Comprehensive details on the tool itself are available elsewhere:

1. [AWS Secure Environment Accelerator tool Operations & Troubleshooting Guide][ops_guide]
2. [AWS Secure Environment Accelerator tool Developer Guide][dev_guide]

Except where absolutely necessary, this document will refrain from referencing the _AWS Secure Environment Accelerator tool_ further.

### 1.2.2. Overview

The central features of the _AWS Secure Environment Architecture_ are as follows:

-   **AWS Organization with multiple-accounts:** An [AWS Organization][aws_org] is a grouping construct for a number of separate AWS accounts that are controlled by a single customer entity. This provides consolidated billing, organizational units, and facilitates the deployment of pan-Organizational guardrails such as CloudTrail logs and Service Control Policies. The separate accounts provide strong control-plane and data-plane isolation between workloads and/or environments.
-   **Encryption:** AWS KMS with customer-managed CMKs is used extensively for any data stored at rest, in S3 buckets, EBS volumes, RDS encryption.
-   **Service Control Policies:** [SCPs][aws_scps] provide a guardrail mechanism principally used to deny entire categories of API operations at an AWS account, OU, or Organization level. These can be used to ensure workloads are deployed only in prescribed regions, ensure only whitelisted services are used, or prevent the disablement of detective/preventative controls. Prescriptive SCPs are provided.
-   **Centralized, Isolated Networking:** [Virtual Private Clouds][aws_vpc] (VPCs) are used to create data-plane isolation between workloads, centralized in a shared-network account. Connectivity to on-prem environments, internet egress, shared resources and AWS APIs are mediated at a central point of ingress/egress via the use of [Transit Gateway][aws_tgw], [Site-to-Site VPN][aws_vpn], Next-Gen Firewalls, and [AWS Direct Connect][aws_dc] (where applicable).
-   **Centralized DNS Management:** [Amazon Route 53][aws_r53] is used to provide unified public and private hosted zones across the cloud environment. Inbound and Outbound Route 53 Resolvers extend this unified view of DNS to on-premises networks.
-   **Comprehensive Logging:** CloudTrail logs are enabled Organization-wide to provide auditability across the cloud environment. CloudWatch Logs, for applications, as well as VPC flow logs, are centralized and deletion is prevented via SCPs.
-   **Detective Security Controls:** Potential security threats are surfaced across the cloud environment via automatic deployment of detective security controls such as GuardDuty, AWS Config, and Security Hub.
-   **Single-Sign-On**: AWS SSO is used to provide AD-authenticated IAM role assumption into accounts across the Organization for authorized principals.

### 1.2.3. Document Convention

Several conventions are used throughout this document to aid understanding.

#### 1.2.3.1. AWS Account Numbers

AWS account numbers are decimal-digit pseudorandom identifiers with 12 digits (e.g. `651278770121`). This document will use the convention that an AWS Organization Management (root) account has the account ID `123456789012`, and child accounts are given by `111111111111`, `222222222222`, etc.

For example the following ARN would refer to a VPC subnet in the `ca-central-1` region in the Organization Management (root) account:

    arn:aws:ec2:ca-central-1:123456789012:subnet/subnet-024759b61fc305ea3

#### 1.2.3.2. JSON Annotation

Throughout the document, JSON snippets may be annotated with comments (starting with `//`). The JSON language itself does not define comments as part of the specification; these must be removed prior to use in most situations, including the AWS Console and APIs.

For example:

```jsonc
{
    "Effect": "Allow",
    "Principal": {
        "AWS": "arn:aws:iam::123456789012:root" // Trust the Organization Management (root) account.
    },
    "Action": "sts:AssumeRole"
}
```

The above is not valid JSON without first removing the comment on the fourth line.

#### 1.2.3.3. IP Addresses

The design makes use of [RFC1918][1918] addresses (e.g. `10.1.0.0/16`) and [RFC6598][6598] (e.g. `100.96.250.0/23`) for various networks; these will be labeled accordingly. Any specific range or IP shown is purely for illustration purposes only.

### 1.2.4. Department Naming

This document will make no reference to specific Government of Canada departments. Where naming is required (e.g. in domain names), this document will use a placeholder name as needed; e.g. `dept.gc.ca`.

### 1.2.5. Relationship to AWS Landing Zone

AWS Landing Zone is an AWS Solution designed to deploy multi-account cloud architectures for customers. The _AWS Secure Environment Architecture_ draws on design patterns from Landing Zone, and re-uses several concepts and nomenclature, but it is not directly derived from it. An earlier internal release of the _AWS Secure Environment Architecture_ presupposed the existence of an AWS Landing Zone in the Organization; this requirement has since been removed as of release `v1.1.0`.

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
