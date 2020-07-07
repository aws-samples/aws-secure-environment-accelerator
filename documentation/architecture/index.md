# PBMM Accelerator Architecture

## 1.0 Introduction

The PBMM Accelerator Architecture is a comprehensive, multi-account AWS cloud architecture, designed for use within the Government of Canada for PBMM workloads. The Accelerator Architecture has been designed to address central identity and access management, governance, data security, network design, and comprehensive logging requirements per ITSG-22 specifications.

The Accelerator Architecture is built on the following tenets:

1. **Infrastructure as Code:**
2. **Scalability:**
3. **Guardrails not Blockers:**
4. **Auditability:**

### 1.1 Purpose of Document

This document is intended to outline the technical measures that are delivered by the Accelerator Architecture that make it suitable for PBMM workloads. An explicit **non-goal** of this document is to explain the delivery architecture of the [_PBMM Accelerator_][accel_tool] tool itself, an open-source software project built by AWS.

While the central purpose of the _PBMM Accelerator_ is to establish an Accelerator Architecture into an AWS account footprint, this amounts to an implementation detail as far as the Accelerator Architecture is concerned. The Architecture is a standalone design, irrespective of how it was delivered into a customer AWS environment. It is nonetheless anticipated that most customers will choose to realize their Accelerator Architecture via the delivery mechanism of the _PBMM Accelerator_.

Comprehensive details on the tool itself are available elsewhere:

1. [PBMM Accelerator Operations & Troubleshooting Guide][ops_guide]
2. [PBMM Accelerator Developer Guide][dev_guide]

Except where absolutely necessary, this document will refrain from referencing the _PBMM Accelerator_ further.

### 1.2 Overview

The central features of the Accelerator Architecture are as follows:

* **AWS Organization with multiple-accounts:** An [AWS Organization][aws_org] is a grouping construct for a number of separate AWS accounts that are controlled by a single customer entity. This provides consolidated billing, organizational units, and facilitates the deployment of pan-Organizational guardrails such as CloudTrail logs and Service Control Policies. The separate accounts provide strong control-plane isolation between workloads and/or environments.
* **Encryption:** AWS KMS with customer-managed CMKs is used extensively for any data stored at rest, in S3 buckets, EBS volumes, RDS encryption.
* **Service Control Policies:** [SCPs][aws_scps] provide a guardrail mechanism principally used to deny entire categories of API operations at an AWS account, OU, or Organization level. These can be used to ensure workloads are deployed only in prescribed regions, ensure only whitelisted services are used, or prevent the disablement of detective/preventative controls. Prescriptive SCPs are provided.
* **Centralized, Isolated Networking:** [Virtual Private Clouds][aws_vpc] (VPCs) are used to create data-plane isolation between workloads, centralized in a shared-network account. Connectivity to on-prem environments, internet egress, shared resources and AWS APIs are mediated at a central point of ingress/egress via the use of [Transit Gateway][aws_tgw], [Site-to-Site VPN][aws_vpn], Next-Gen Firewalls, and [AWS Direct Connect][aws_dc] (where applicable).
* **Centralized DNS Management:** [Amazon Route 53][aws_r53] is used to provide unified public and private hosted zones across the cloud environment. Inbound and Outbound Route 53 Resolvers extend this unified view of DNS to on-premises networks.
* **Comprehensive Logging:** CloudTrail logs are enabled Organization-wide to provide auditability across the cloud environment. CloudWatch Logs, for applications, as well as VPC flow logs, are centralized and deletion is prevented via SCPs.
* **Detective Security Controls:** Potential security threats are surfaced across the cloud environment via automatic deployment of detective security controls such as GuardDuty, AWS Config, and Security Hub.
* **Single-Sign-On**: AWS SSO is used to provide AD-authenticated IAM role assumption into accounts across the Organization for authorized principals.


## I. Account Structure
## II. Networking
## III. Authorization and Authentication
## IV. Logging and Monitoring




[ops_guide]: https://TODO
[dev_guide]: https://TODO
[accel_tool]: https://github.com/aws-samples/aws-pbmm-accelerator
[aws_org]: https://aws.amazon.com/organizations/
[aws_scps]: https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_type-auth.html#orgs_manage_policies_scp
[aws_vpn]: https://aws.amazon.com/TODO
[aws_dc]: https://aws.amazon.com/TODO
[aws_vpc]: https://aws.amazon.com/TODO
[aws_tgw]: https://aws.amazon.com/TODO
[aws_r53]: https://aws.amazon.com/route53/