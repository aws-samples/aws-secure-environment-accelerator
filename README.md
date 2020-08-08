# AWS Secure Environment Accelerator

The AWS Accelerator is a tool designed to deploy and operate secure multi-account AWS environments on an ongoing basis. The power of the solution is the configuration file that drives the architecture deployed by the tool. This enables extensive flexibility and for the completely automated deployment of a customized architecture within AWS without changing a single line of code.

While flexible, the AWS Accelerator is delivered with a sample configuration file which deploys an opinionated and prescriptive architecture designed to meet the security and operational requirements of many governments around the world (initial focus was the Government of Canada). Tuning the parameters within the configuration file allows for the deployment of these customized architectures and enables the solution to meet the requirements of a broad range of governments and public sector organizations.

Installation of the provided prescriptive architecture is reasonably simple, deploying a customized architecture does require extensive understanding of the AWS platform.

## What specifically does the Accelerator deploy and manage?

A common misconception is that the AWS Secure Environment Accelerator only deploys security services, not true. The Accelerator is capable of deploying a complete end-to-end hybrid enterprise cloud environment.

Additionally, while the Accelerator is initially responsible for deploying a prescribed architecture, it more importantly allows for organizations to operate, evolve, and maintain their cloud architecture and security controls over time and as they grow, with mininal effort, often using native AWS tools. Customers don't have to change the way they operate in AWS.

Specifically the accelerator deploys and manages the following functionality, both at initial accelerator deployment and as new accounts are created, added, or onboarded:

### Creates AWS Account

- Core Accounts - as many or as few as your organization requires, using the naming you desire
  - Shared Network
  - Operations
  - Perimeter
  - Log-Archive
  - Security-Audit
- Workload Accounts - automate mass account creation, or use AWS organizations to scale one account at a time
- Supports AWS Organizations nested ou's and importing existing AWS accounts
- Performs 'account warming' to establish initial limits, when required
- Automatically submits limit increases, when required (complies with initial limits until increased)

### Creates Networking

- Transit Gateways and TGW route tables
- Centralized and/or Local VPC's
- Subnets, Route tables, NACLs, Security groups, NATGWs, IGWs, VGWs, CGWs
- VPC Endpoints (Gateway and Interface, Centralized or Local)
- Route 53 Private and Public Zones, Resolver Rules and Endpoints, VPC Endpoint Overloaded Zones
- All completely and indivdiually customizable (per account, VPC, or OU)
- Deletes default VPC's (worldwide)

### Cross-Account Object Sharing

- VPC and Subnet sharing, including account level retagging (Per account security group 'replication')
- VPC attachments and peering (local and cross-account)
- Zone sharing and VPC associations
- Managed Active Directory sharing, including R53 DNS resolver rule creation/sharing
- (automated TGW inter-region peering on roadmap)

### Identity

- Creates Directory services (Managed Active Directory and Active Directory Connectors)
- Creates Windows admin bastion host auto-scaling group
- Set Windows domain password policies
- Set IAM account password policies
- Creates Windows domain users and groups (initial installation only)
- Creates IAM Policies, Roles, Users, and Groups
- Fully integrates with and leverages AWS SSO for centralized and federated login

### Cloud Security Services

- Enables and configures the following AWS services, worldwide w/central designated admin account:
  - Guardduty
  - Security Hub (Enables designated security standards, and disables individual controls)
  - Firewall Manager
  - CloudTrail w/Insights and S3 data plane logging
  - Config Recorders/Aggregator
  - Macie
  - IAM Access Analyzer
  - CloudWatch access from central designated admin account (and setting Log group retentions)

### Other Security Capabilities

- Creates, deploys and applies Service Control Policies
- Creates Customer Managed KMS Keys (SSM, EBS, S3)
- Enables account level default EBS encryption and S3 Block Public Access
- Configures Systems Manager Session Manager w/KMS encryption and centralized logging
- Creates and configures AWS budgets (customizable per ou and per account)
- Imports or requests certificates into AWS Certificate Manager
- Deploys both perimeter and account level ALB's w/Lambda health checks, certificates and TLS policies
- Deploys & configures 3rd party firewall clusters and management instances w/vendor best practices and sample security policies, w/automated TGW ECMP BGP tunnel standup
- Protects Accelerator deployed and managed objects

### Centralized Logging

- Deploys an rsyslog auto-scaling cluster behind an NLB, all syslogs forwarded to CWL
- Centralizes logging to a single centralize S3 bucket (enables, configures and centralizes)
  - VPC Flow logs (Enhanced metadata fields and CWL destination coming soon)
  - Organizational Cost and Usage Reports
  - CloudTrail Logs including S3 Data Plane Logs (also sent to CWL)
  - All CloudWatch Logs (includes rsyslog logs)
  - Config History and Snapshots
  - Route 53 Public Zone Logs
  - GuardDuty Findings
  - Macie Discovery results
  - ALB Logs
  - SSM Session Logs
- Centralized access to "Cloud Security Service" Consoles from designated AWS account

## Relationship with AWS Landing Zone Solution (ALZ)

The ALZ is an AWS Solution designed to deploy a multi-account AWS architecture for customers based on best practices and lessons learned from some of AWS' largest customers. The AWS Accelerator draws on design patterns from the Landing Zone, and re-uses several concepts and nomenclature, but it is not directly derived from it, nor does it leverage any code from the ALZ.

The AWS Accelerator is a superset of the ALZ. The initial versions of the AWS Accelerator presupposed the existence of an AWS Landing Zone Solution in the AWS Organization; this requirement has since been removed as of release `v1.1.0`.

While the option remains to deploy the AWS Accelerator on top of the ALZ, all new customers are strongly encourage to let the AWS Accelerator deploy and manage the entire environment by performing a standalone installation of the AWS Accelerator.

## Relationship with AWS Control Tower

AWS Control Tower is the successor to the ALZ, but offered as an AWS managed service. Many Public Sector customers have found Control Towers limited regional coverage, limited functionality and lack of customizability has made it unsuitable in meeting their requirements.

When appropriate, it is envisioned that the AWS Accelerator will add the capability to be deployed on top of AWS Control Tower, as we allow with the ALZ today.

## Accelerator Deployment Process (Summary)

This summarizes the installation process, the full installation document can be found in the documentation section below.

- Create a config.json file to represent your organizations requirements (PBMM sample provided)
- Create a Secrets Manager Secret which contains a GitHub token with access to the Accelerator code repo
- Create a unique S3 input bucket and place your config.json and any additional custom config files in the bucket
- Download and execute the latest installer CloudFormation template in your master accounts preferred 'primary' region
- Wait for:
  - CloudFormation to deploy and start the Code Pipeline (~5 mins)
  - Code Pipeline to download the Accelerator codebase and install the Accelerator State Machine (~15 mins)
  - The Accelerator State Machine to finish execution (~3hrs)
- Perform required manual follow-up activities (configure AWS SSO, set firewall passwords, etc.)
- When required:
  - Use AWS Organizations to create new fully managed and guardrailed AWS accounts
  - Update the config file in CodeCommit and run the Accelerator State Machine (~20min) to:
    - deploy, configure and guardrail multiple accounts at the same time
    - change Accelerator configuration settings

# **Documentation** (Linked)

### - [Installation, Upgrades and Basic Operations Guide](docs/installation/index.md)

### - [Accelerator Operations/Troubleshooting Guide](https://github.com/aws-samples/aws-pbmm-accelerator/wiki/Operations-Guide) (Early Draft)

### - [Accelerator Developer Guide](https://github.com/aws-samples/aws-pbmm-accelerator/wiki/Developer-Guide) (Early Draft)

### - [Prescriptive PBMM Architecture Design Document.](https://github.com/aws-samples/aws-pbmm-accelerator/blob/feature/8.35-architecture-document-v2/docs/architectures/pbmm/index.md) (Early Draft)

### - [Frequently Asked Questions](docs/faq/index.md) (Future)

[...Go to Table of Contents](docs/index.md)
