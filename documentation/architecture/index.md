# PBMM Accelerator Architecture

## I. Introduction

The PBMM Accelerator Architecture is a comprehensive, multi-account AWS cloud architecture, designed for use within the Government of Canada for PBMM workloads. The Accelerator Architecture has been designed to address central identity and access management, governance, data security, network design, and comprehensive logging requirements per ITSG-22 specifications.

The Accelerator Architecture has been built with the following design principles in mind:

1. Maximize agility, scalability, and availability
2. Enable the full capability of the AWS cloud and do not artificially limit capabilities based on lowest common denominator supported capabilities of other cloud providers
4. Be adaptable to evolving technological capabilities in the underlying platform being used in the architecture
5. Allow for seamless auto-scaling and give potentially unlimited bandwidth as bandwidth requirements increase (or decrease) based on actual customer load. This is a key aspect of the value proposition of cloud computing
6. High availability is paramount: the design stretches across two physical AWS Availability Zones (AZ), such that the loss of any one AZ does not impact application availability. The design can be easily extended to a third availability zone.


### 1.1 Purpose of Document

This document is intended to outline the technical measures that are delivered by the Accelerator Architecture that make it suitable for PBMM workloads. An explicit **non-goal** of this document is to explain the delivery architecture of the [_PBMM Accelerator_][accel_tool] tool itself, an open-source software project built by AWS.

While the central purpose of the _PBMM Accelerator_ is to establish an Accelerator Architecture into an AWS account footprint, this amounts to an implementation detail as far as the Accelerator Architecture is concerned. The Architecture is a standalone design, irrespective of how it was delivered into a customer AWS environment. It is nonetheless anticipated that most customers will choose to realize their Accelerator Architecture via the delivery mechanism of the _PBMM Accelerator_.

Comprehensive details on the tool itself are available elsewhere:

1. [PBMM Accelerator Operations & Troubleshooting Guide][ops_guide]
2. [PBMM Accelerator Developer Guide][dev_guide]

Except where absolutely necessary, this document will refrain from referencing the _PBMM Accelerator_ further.

### 1.2 Overview

The central features of the Accelerator Architecture are as follows:

* **AWS Organization with multiple-accounts:** An [AWS Organization][aws_org] is a grouping construct for a number of separate AWS accounts that are controlled by a single customer entity. This provides consolidated billing, organizational units, and facilitates the deployment of pan-Organizational guardrails such as CloudTrail logs and Service Control Policies. The separate accounts provide strong control-plane and data-plane isolation between workloads and/or environments.
* **Encryption:** AWS KMS with customer-managed CMKs is used extensively for any data stored at rest, in S3 buckets, EBS volumes, RDS encryption.
* **Service Control Policies:** [SCPs][aws_scps] provide a guardrail mechanism principally used to deny entire categories of API operations at an AWS account, OU, or Organization level. These can be used to ensure workloads are deployed only in prescribed regions, ensure only whitelisted services are used, or prevent the disablement of detective/preventative controls. Prescriptive SCPs are provided.
* **Centralized, Isolated Networking:** [Virtual Private Clouds][aws_vpc] (VPCs) are used to create data-plane isolation between workloads, centralized in a shared-network account. Connectivity to on-prem environments, internet egress, shared resources and AWS APIs are mediated at a central point of ingress/egress via the use of [Transit Gateway][aws_tgw], [Site-to-Site VPN][aws_vpn], Next-Gen Firewalls, and [AWS Direct Connect][aws_dc] (where applicable).
* **Centralized DNS Management:** [Amazon Route 53][aws_r53] is used to provide unified public and private hosted zones across the cloud environment. Inbound and Outbound Route 53 Resolvers extend this unified view of DNS to on-premises networks.
* **Comprehensive Logging:** CloudTrail logs are enabled Organization-wide to provide auditability across the cloud environment. CloudWatch Logs, for applications, as well as VPC flow logs, are centralized and deletion is prevented via SCPs.
* **Detective Security Controls:** Potential security threats are surfaced across the cloud environment via automatic deployment of detective security controls such as GuardDuty, AWS Config, and Security Hub.
* **Single-Sign-On**: AWS SSO is used to provide AD-authenticated IAM role assumption into accounts across the Organization for authorized principals.

### 1.3 Document Convention

Several conventions are used throughout this document to aid understanding.


#### AWS Account Numbers

AWS account numbers are decimal-digit pseudorandom identifiers with 12 digits (e.g. `651278770121`). This document will use the convention that an AWS master account has the account ID `123456789012`, and child accounts are given by `111111111111`, `222222222222`, etc.

For example the following ARN would refer to a VPC subnet in the `ca-central-1` region in the master account:


    arn:aws:ec2:ca-central-1:123456789012:subnet/subnet-024759b61fc305ea3

#### JSON Annotation

Throughout the document, JSON snippets may be annotated with comments (starting with `# `). The JSON language itself does not include comments as part of the specification; these must be removed prior to use in most situations, including the AWS Console and APIs.

For example:

```json
{
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::123456789012:root"  # Trust the master account.
  },
  "Action": "sts:AssumeRole"
}
```

The above is not valid JSON without first removing the comment on the fourth line.

### 1.4 Department Naming

This document will make no reference to specific Government of Canada departments. Where naming is required (e.g. in domain names), this document will use a placeholder name as needed; e.g. `dept.gc.ca`.

### 1.5 Relationship to AWS Landing Zone
AWS Landing Zone is an AWS Solution designed to deploy multi-account cloud architectures for customers. The Accelerator Architecture draws on design patterns from Landing Zone, and re-uses several concepts and nomenclature, but it is not directly derived from it. An earlier internal release of the Accelerator Architecture presupposed the existence of an AWS Landing Zone in the Organization; this requirement has since been removed as of release `vTODO`.


## 2. Account Structure

AWS accounts are a strong isolation boundary; by default there is zero control plane or data plane access from one AWS account to another. AWS Organizations is a service that provides centralized billing across a fleet of accounts, and optionally, some integration-points for cross-account guardrails and cross-account resource sharing. The Accelerator Architecture uses these features of AWS Organizations to realize its design.

## Accounts

The Accelerator Architecture includes the following AWS accounts.

Note that the account structure is strictly a control plane concept - nothing about this structure implies anything about the network design or network flows.


![Organizations Diagram](./images/organization_structure.drawio.png)

### Master Account
The AWS Organization resides in the master account. This account is not used for workloads (to the full extent possible) - it functions primarily as a billing aggregator, and a gateway to the entire cloud footprint for a high-trust principal. There exists a trust relationship between child AWS accounts in the Organization and the master account; i.e. the child accounts have a role of this form:

```json
{
  "Role": {
    "Path": "/",
    "RoleName": "AWSCloudFormationStackSetExecutionRole",
    "Arn": "arn:aws:iam::111111111111:role/AWSCloudFormationStackSetExecutionRole",  # Child account.
    "AssumeRolePolicyDocument": {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "AWS": "arn:aws:iam::123456789012:root"  # Master account may assume this role.
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }
  }
}
```


#### AWS SSO
AWS SSO resides in the master account in the organization, due to a current requirement of the AWS SSO service. This service deploys IAM roles into the accounts in the Organization.

TODO(Dave): more details on SSO


#### Organizational Units
Underneath the root of the Organization, Organizational Units (OUs) provide an optional mechanism for grouping accounts into logical collections. Aside from the benefit of the grouping itself, these collections serve as the attachment points for SCPs (preventative API-blocking controls), and Resource Access Manager sharing (cross-account resource sharing). Example use cases are as follows:

* An SCP is attached to the core OU to prevent the deletion of Transit Gateway resources in the associated accounts.
* The shared network account uses RAM sharing to share the development line-of-business VPC with a development OU. This makes the VPC available to a functional account in that OU used by developers, despite residing logically in the shared network account.

OUs may be nested (to a total depth of five), with SCPs and RAM sharing applied at the desired level.

### Core OU
This OU houses all administrative accounts, such as the core landing zone accounts. No application accounts or application workloads are intended to exist within this OU. This OU also contains the centralized networking infrastructureSharedNetwork


### Central OU

### Functional OUs






## 3. Networking
## 4. Authorization and Authentication
## 5. Logging and Monitoring




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