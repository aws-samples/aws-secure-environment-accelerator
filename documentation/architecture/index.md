# AWS Secure Environment Accelerator Architecture

## Table of Contents
1. [Introduction](#introduction)
1. [Account Structure](#AccountStructure)
1. [Networking](#Networking)
1. [Authorization and Authentication](#AA)
1. [Logging and Monitoring](#LM)


<a name="Introduction"/>

## 1. Introduction

The AWS Secure Environment Accelerator Architecture is a comprehensive, multi-account AWS cloud architecture, designed for use within the Government of Canada for PBMM workloads. The Accelerator Architecture has been designed to address central identity and access management, governance, data security, comprehensive logging, and network design/segmentation per ITSG-33 specifications.

The Accelerator Architecture has been built with the following design principles in mind:

1. Maximize agility, scalability, and availability
2. Enable the full capability of the AWS cloud and do not artificially limit capabilities based on lowest common denominator supported capabilities of other cloud providers
4. Be adaptable to evolving technological capabilities in the underlying platform being used in the architecture
5. Allow for seamless auto-scaling and provide unbounded bandwidth as bandwidth requirements increase (or decrease) based on actual customer load (a key aspect of the value proposition of cloud computing)
6. High availability is paramount: the design stretches across two physical AWS Availability Zones (AZ), such that the loss of any one AZ does not impact application availability. The design can be easily extended to a third availability zone.


### 1.1 Purpose of Document

This document is intended to outline the technical measures that are delivered by the Accelerator Architecture that make it suitable for PBMM workloads. An explicit **non-goal** of this document is to explain the delivery architecture of the [_PBMM Accelerator_][accel_tool] tool itself, an open-source software project built by AWS.

While the central purpose of the _PBMM Accelerator_ is to establish an Accelerator Architecture into an AWS account footprint, this amounts to an implementation detail as far as the Accelerator Architecture is concerned. The Architecture is a standalone design, irrespective of how it was delivered into a customer AWS environment. It is nonetheless anticipated that most customers will choose to realize their Accelerator Architecture via the delivery mechanism of the _PBMM Accelerator_.

Comprehensive details on the tool itself are available elsewhere:

1. [AWS Secure Environment Accelerator Operations & Troubleshooting Guide][ops_guide]
2. [AWS Secure Environment Accelerator Developer Guide][dev_guide]

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

Throughout the document, JSON snippets may be annotated with comments (starting with `# `). The JSON language itself does not define comments as part of the specification; these must be removed prior to use in most situations, including the AWS Console and APIs.

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

#### IP Addresses

 The design makes use of [RFC1918][1918] addresses (e.g. `10.1.0.0/16`) and [RFC6598][6598] (e.g. `100.96.250.0/23`) for various networks; these will be labeled accordingly. Any specific range or IP shown is purely for illustration purposes only.



### 1.4 Department Naming

This document will make no reference to specific Government of Canada departments. Where naming is required (e.g. in domain names), this document will use a placeholder name as needed; e.g. `dept.gc.ca`.

### 1.5 Relationship to AWS Landing Zone
AWS Landing Zone is an AWS Solution designed to deploy multi-account cloud architectures for customers. The Accelerator Architecture draws on design patterns from Landing Zone, and re-uses several concepts and nomenclature, but it is not directly derived from it. An earlier internal release of the Accelerator Architecture presupposed the existence of an AWS Landing Zone in the Organization; this requirement has since been removed as of release `vTODO`.


<a name="AccountStructure"/>
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

Note that this is a different role name than the default installed by AWS Organizations (`OrganizationAccountAccessRole`).


#### AWS SSO
AWS SSO resides in the master account in the organization, due to a current requirement of the AWS SSO service. This service deploys IAM roles into the accounts in the Organization. More details on SSO are available in the **Authentication and Authorization** section.


#### Organizational Units
Underneath the root of the Organization, Organizational Units (OUs) provide an optional mechanism for grouping accounts into logical collections. Aside from the benefit of the grouping itself, these collections serve as the attachment points for SCPs (preventative API-blocking controls), and Resource Access Manager sharing (cross-account resource sharing).

![OUs](./images/ous.png)

Example use cases are as follows:


* An SCP is attached to the core OU to prevent the deletion of Transit Gateway resources in the associated accounts.
* The shared network account uses RAM sharing to share the development line-of-business VPC with a development OU. This makes the VPC available to a functional account in that OU used by developers, despite residing logically in the shared network account.

OUs may be nested (to a total depth of five), with SCPs and RAM sharing applied at the desired level. A typical Accelerator Architecture environment will have the following OUs:

##### Core OU
This OU houses all administrative accounts, such as the core landing zone accounts. No application accounts or application workloads are intended to exist within this OU. This OU also contains the centralized networking infrastructure in the `SharedNetwork` account.


##### Central OU
This OU houses accounts containing centralized resources, such as a shared AWS Directory Service (Microsoft AD) instance. Other shared resources such as software development tooling (source control, testing infrastructure), or asset repositories should be created in this OU.

##### Functional OU: Sandbox
This OU contains a set of Sandbox accounts used by development teams for proof of concept / prototyping work. These accounts are isolated at a network level and are not connected to the VPCs hosting development, test and production workloads. These accounts have direct internet access via an internet gateway (IGW). They do not route through the Perimeter Security services VPC for internet access.

##### Functional OU: UnClass
Accounts in this OU host unclassified application solutions. These accounts have internet access via the Perimeter firewall. This is an appropriate place to do cross-account unclassified collaboration with other departments or entities, or test services that are not available in the Canadian region.

##### Functional OU: Dev
Accounts in this OU host development tools and line of business application solutions that are part of approved releases and projects. These accounts have internet access via the Perimeter firewall.

##### Functional OU: Test
Accounts in this OU host test tools and line of business application solutions that are part of approved releases and projects. These accounts have internet access via the Perimeter firewall.

##### Functional OU: Prod
Accounts in this OU host production tools and line of business application solutions that are part of approved releases and projects. These accounts have internet access via the Perimeter firewall. Accounts in this OU are locked down with only specific Operations and Security personnel having access.

##### Suspended OU
A suspended OU is created to act as a container for end-of-life accounts or accounts with suspected credential leakage. The `DenyAll` SCP is applied, which prevents all control-plane API operations from taking place by any account principal.

### Mandatory Accounts
The Accelerator Architecture is an opinionated design, which partly manifests in the accounts that are deemed mandatory within the Organization. The following accounts are assumed to exist, and each has an important function with respect to the goals of the overall Architecture (mandatory in red)

![Mandatory Accounts](./images/accounts.png)

#### Master
As discussed above, the master account functions as the root of the AWS Organization, the billing aggregator, attachment point for SCPs. Workloads are not intended to run in this account.

**Note:** Customers deploying the Accelerator Architecture via the AWS Secure Environment Accelerator tool will deploy into this account. See the [Operations Guide][ops_guide] for more details.

#### Perimeter
The perimeter account, and in particular the perimeter VPC therein, functions as the single point of ingress/egress from the PBMM cloud environment to the public internet and/or on-premises network. This provides a central point of network control through which all workload-generated traffic, ingress and egress, must transit. The perimeter VPC hosts next-generation firewall instances that provide security services such as virus scanning, malware protection, intrusion protection, TLS inspection, and web application firewall functionality. More details on can be found in the Networking section of this document.

#### Shared Network
The shared network account hosts the vast majority of the AWS-side of the networking resources throughout the Architecture. Workload-scoped VPCs (`Dev`, `Test`, `Prod`, etc) are defined here, and shared via RAM sharing to the respective OUs in the Organization. A Transit Gateway provides connectivity from the workloads to the internet or on-prem, without permitting cross-environment (AKA "East:West traffic") traffic (e.g. there is no Transit Gateway route from the `Dev` VPC to the `Prod` VPC). More details on can be found in the Networking section of this document.

#### Operations
The operations account provides a central location for the cloud team to provide cloud operation services to other AWS accounts within the Organization; for example CICD, developer tooling, and a managed Active Directory installation.


#### Log Archive
The log archive account is provide a central aggregation and secure storage point for all audit logs created within the AWS Organization. This account contains a centralized location for copies of every account’s Audit and Configuration compliance logs. It also provides a storage location for any other audit/compliance logs, as well as application/OS logs.

The AWS CloudTrail service provides a full audit history of all actions taken against AWS services, including users logging into accounts. We recommend access to this account be restricted to auditors or security teams for compliance and forensic investigations related to account activity. Additional CloudTrail trails for operational use can be created in each account.


#### Security
The security account is restricted to authorized security and compliance personnel, and related security or audit tools. This is an aggregation point for security services, including AWS Security Hub, and serves as the master for Amazon Guard Duty. A trust relationship with a readonly permission policy exists between every Organization account and the security account for audit and compliance purposes.


### Functional Accounts

Functional accounts are created on demand, and placed into an appropriate OU in the Organization structure. The purpose of functional accounts is to provide a secure and managed environment where project teams can use AWS resources. They provide an isolated control plane so that the actions of one team in one account cannot inadvertently affect the work of other teams in other accounts.

Functional accounts will gain access to the RAM shared resources of their respective parent OU. Accounts created for `systemA` and `systemB` in the `Dev` OU would have control plane isolation from each other; however these would both have access to the `Dev` VPC (shared from the `SharedNetwork` account).

Data plane isolation within the same VPC is achieved by default, by using appropriate security groups whenever ingress is warranted. For example, the app tier of `systemA` should only permit ingress from the `systemA-web` security group, not an overly broad range such as `0.0.0.0/0`, or even the VPC range.

### Account Level Settings
The Accelerator Architecture recommends the enabling of certain account-wide features on account creation. Namely, these include:

1. [S3 Public Access Block][s3-block]
2. [By-default encryption of EBS volumes][ebs-encryption].

### Private Marketplace
The Accelerator Architecture recommends that the AWS Private Marketplace is enabled for the Organization. Private Marketplace helps administrators govern which products they want their users to run on AWS by making it possible to see only products that comply with their organization's procurement policy. When Private Marketplace is enabled, it will replace the standard AWS Marketplace for all users.

![PMP](./images/pmp.png)

<a name="Networking"/>
## 3. Networking

### Overview
The Accelerator Architecture networking is built on a principle of centralized on-premises and Internet ingress/egress, while enforcing data plane isolation between workloads in different environments. Connectivity to on-prem environments, internet egress, shared resources and AWS APIs are mediated at a central point of ingress/egress via the use of a [Transit Gateway][aws_tgw]. Consider the following overall network diagram:

![Mandatory Accounts](./images/network_architecture.drawio.png)

All functional accounts use RAM-shared networking infrastructure as depicted above. The workload VPCs (Dev, Test, Prod, etc) are hosted in the Shared Network account and made available to the appropriate OU in the Organization.

### Perimeter
The perimeter VPC hosts the Organization's perimeter security services. The Perimeter VPC is used to control the flow of traffic between AWS Accounts and external networks: both public and private via GC CAP and GC TIP. This VPC hosts Next Generation Firewalls (NGFW) that provide perimeter security services including virus scanning / malware protection, Intrusion Protection services, TLS Inspection and Web Application Firewall protection. If applicable, this VPC also hosts reverse proxy servers.

The Architecture recommends that the perimeter VPC have a primary range in the [RFC1918][1918] block (e.g. `10.7.4.0/22`) for the detonation subnet, and a secondary range in the [RFC6598][6598] block (e.g. `100.96.250.0/23`) used for the overlay network (NGFW devices inside VPN tunnel) for all other subnets. This secondary range is assigned by an external entity (e.g. Shared Services Canada).

![Endpoints](./images/perimeter.drawio.png)

This VPC has four subnets per AZ, each of which hosts a port used by the NGFW devices, which are deployed in an HA pair. The purpose of these subnets is as follows.

* **Detonation**: This is an unused subnet reserved for future use with malware detonation capabilities of the NGFW devices.
    * e.g. `10.7.4.0/24` - not routable except local.
* **Proxy**: This subnet hosts reverse proxy services for web and other protocols. It also contains the [three interface endpoints][ssm_endpoints] necessary for AWS Systems Manager Session Manager, which enables SSH-less CLI access to authorized and authenticated principals in the perimeter account.
    * e.g. `100.96.251.64/26`
* **On-Premises**: This subnet hosts the private interfaces of the firewalls, corresponding to connections from the on-premises network.
    * e.g. `100.96.250.192/26`
* **FW-Management**: This subnet is used to host management tools and the management of the Firewalls itself.
    * e.g. `100.96.251.160/27` - a smaller subnet is permissible due to modest IP requirements for management instances.
* **Public**: This subnet is the public-access zone for the perimeter VPC. It hosts the public interface of the firewalls, as well as application load balancers that are used to balance traffic across the firewall pair. There is one Elastic IPv4 address per public subnet that corresponds to the IPSec Customer Gateway (CGW) for the VPN connection into the Transit Gateway in Shared Networking.
    * e.g. `100.96.250.0/26`

Outbound internet connections (for software updates, etc.) can be initiated from within the workload VPCs, and use the transparent proxy feature of the next-gen Firewalls.

### Shared Network
The shared network account, and the AWS networking resources therein, form the core of the cloud networking infrastructure across the account structure. Rather than the individual accounts define their own networks, these are instead centralized here and shared out to the relevant OUs. Principals in a Dev OU will have access to a Dev VPC, Test OU will have access to a Test VPC and so on - all of which are owned by this account.

You can share AWS Transit Gateways, Subnets, AWS License Manager configurations, and Amazon Route 53 Resolver rules resources with AWS Resource Access Manager (RAM). The RAM service eliminates the need to create duplicate resources in multiple accounts, reducing the operational overhead of managing those resources in every single account.

#### Transit Gateway
The Transit Gateway is a central hub that performs several core functions within the Shared Network account.

1. Routing of permitted flows; for example a Workload to On-premises via the Perimeter VPC.
    * All routing tables in SharedNetwork VPCs send `0.0.0.0/0` traffic to the TGW, where its handling will be determined by the TGW Route Table (TGW-RT) that its attachment is associated with. For example:
        * an HTTP request to `registry.hub.docker.com` from the Test VPC will go to the TGW
        * The Segregated TGW RT will direct that traffic to the Perimeter VPC via the IPsec VPNs
        * The request will be proxied to the internet, via GC-CAP if appropriate
        * The return traffic will again transit the IPsec VPNs
        * The `10.3.0.0/16` bound response traffic will arrive at the Core TGW RT, where a propagation in that TGW RT will direct the response back to the Test VPC.
2. Defining separate routing domains that prohibit undesired east-west flows at the network level; for example, by prohibiting Dev to Prod traffic. For example:
    * All routing tables in SharedNetwork VPCs send `0.0.0.0/0` traffic to the TGW, which defines where the next permissible hop is. For example, `10.2.0.0/16` Dev traffic destined for the `10.0.4.0/16` Prod VPC will be blocked by the blackhole route in the Segregated TGW RT.
3. Enabling centralization of shared resources; namely a shared Microsoft AD installation in the Central VPC, and access to shared VPC Endpoints in the Endpoint VPC.
    * The Central VPC, and the Endpoint VPC are routable from Workload VPCs. This provides an economical way to share Organization wide resources that are nonetheless isolated into their own VPCs. For example:
        * a `git` request in the `Dev` VPC to `git.private-domain.ca` resolves to a `10.1.0.0/16` address in the `Central` VPC.
        * The request from the `Dev` VPC will go to the TGW due to the VPC routing table associated with that subnet
        * The TGW will send the request to the `Central` VPC via an entry in the Segregated TGW RT
        * The `git` response will go to the TGW due to the VPC routing table associated with that subnet
        * The Shared TGW RT will direct the response back to the `Dev` VPC

The four TGW RTs exist to serve the following main functions:

* **Segregated TGW RT**: Used as the association table for the workload VPCs; prevents  east-west traffic, except to shared resources.
* **Core TGW RT**: Used for internet/on-premises response traffic, and Endpoint VPC egress.
* **Shared TGW RT**: Used to provide `Central` VPC access east-west for the purposes of response traffic to shared workloads
* **Standalone TGW RT**: Reserved for future use. Prevents TGW routing except to the Endpoint VPC.

Note that a unique BGP ASN will need to be available for the TGW.

#### Endpoint VPC

DNS functionality for the network architecture is centralized in the Endpoint VPC. It is recommended that the Endpoint VPC use a [RFC1918][1918] range - e.g. `10.7.0.0/22` with sufficient capacity to support 60+ AWS services and future endpoint expansion, and inbound and outbound resolvers (all figures per AZ).

![Endpoints](./images/dns.drawio.png)

#### Endpoint VPC: Interface Endpoints

The endpoint VPC hosts VPC Interface Endpoints (VPCEs) and associated Route 53 private hosted zones for all applicable services in the `ca-central-1` region. This permits traffic destined for an eligible AWS service; for example SQS, to remain entirely within the SharedNetwork account rather than transiting via the IPv4 public endpoint for the service:

![Endpoints](./images/endpoints.png)

From within an associated workload VPC such as `Dev`, the service endpoint (e.g. `sqs.ca-central-1.amazonaws.com`) will resolve to an IP in the `Endpoint` VPC:

```bash
sh-4.2$ nslookup sqs.ca-central-1.amazonaws.com
Server:         10.2.0.2                  # Dev VPC's .2 resolver.
Address:        10.2.0.2#53

Non-authoritative answer:
Name:   sqs.ca-central-1.amazonaws.com
Address: 10.7.1.190                       # IP in Endpoint VPC - AZ-a.
Name:   sqs.ca-central-1.amazonaws.com
Address: 10.7.0.135                       # IP in Endpoint VPC - AZ-b.
```

This cross-VPC resolution of the service-specific private hosted zone functions via the association of each VPC to each private hosted zone, as depicted above.

#### Endpoint VPC: Hybrid DNS

The Endpoint also VPC hosts the common DNS infrastructure used to resolve DNS queries:

* within the cloud
* from the cloud to on-premises
* from on-premises to the cloud


##### Within The Cloud
In-cloud DNS resolution applies beyond the DNS infrastructure that is put in place to support the Interface Endpoints for the AWS services in-region. Other DNS zones, associated with the Endpoint VPC, are resolvable the same way via an association to workload VPCs.

##### From Cloud to On-Premises
DNS Resolution from the cloud to on-premises is handled via the use of a Route 53 Outbound Endpoint, deployed in the Endpoint VPC, with an associated Resolver rule that fowards DNS traffic to the outbound endpoint. Each VPC is associated to this rule.

![Endpoints](./images/resolver-rule.png)

##### From On-Premises to Cloud
Conditional forwarding from on-premises networks is made possible via the use of a Route 53 Inbound Endpoint. On-prem networks send resolution requests for relevant domains to the endpoints deployed in the Endpoint VPC:

![Endpoints](./images/inbound-resolver.png)



#### Workload VPCs
The workload VPCs are where line of business applications ultimately reside, segmented by environment (`Dev`, `Test`, `Prod`, etc). It is recommended that the Workload VPC use a [RFC1918][1918] range (e.g. `10.2.0.0/16` for `Dev`, `10.3.0.0/16` for `Test`, etc).

![Endpoints](./images/workload.drawio.png)

Note that security groups are recommended as the primary data-plane isolation mechanism between applications that may coexist in the same VPC. It is anticipated that unrelated applications would coexist in their respective tiers without ever permitting east-west traffic flows.

The following subnets are defined by the Architecture:

* **TGW subnet**: This subnet hosts the elastic-network interfaces for the TGW attachment. A `/27` subnet is sufficient.
* **Web subnet**: This subnet hosts front-end or otherwise 'client' facing infrastructure. A `/20` or larger subnet is recommended to facilitate auto-scaling.
* **App subnet**: This subnet hosts app-tier code (EC2, containers, etc). A `/19` or larger subnet is recommended to facilitate auto-scaling.
* **Data subnet**:  This subnet hosts data-tier code (RDS instances, ElastiCache instances). A `/21` or larger subnet is recommended.
* **Mgmt subnet**: This subnet hosts bastion or other management instances. A `/21` or larger subnet is recommended.

Each subnet is associated with a Common VPC Route Table, as depicted above. Gateway Endpoints for relevant services (Amazon S3, Amazon DynamoDB) are installed in the Common route tables of all Workload VPCs. Aside from local traffic or gateway-bound traffic, `0.0.0.0/0` is always destined for the TGW.


##### Security Groups
Security Groups are instance level firewalls, and represent a foundational unit of network segmentation across AWS networking. Security groups are stateful, and support ingress/egress rules based on protocols and source/destinations. While CIDR ranges are supported by the latter, it is preferable to instead use other security groups as source/destinations. This permits a higher level of expressiveness that is not coupled to particular CIDR choices and works well with autoscaling; e.g.

>  "permit port 3306 traffic from the `App` tier to the `Data` tier"

versus

> "permit port 3306 traffic from `10.0.1.0/24`  to `10.0.2.0/24`.

Note that in practice, egress rules are generally used in 'allow all' mode, with the focus primarily being on whitelisting certain ingress traffic.

##### NACLs
Network Access-Control Lists (NACLs) are used sparingly as a defense-in-depth measure. Given that each network flow requires potentially four NACL entries (egress from ephemeral, ingress to destination, egress from destination, ingress to ephemeral), the marginal security value of exhaustive NACL use is generally not worth the administrative complexity. The architecture recommends NACLs as a segmentation mechanism for `Data` subnets; i.e. `DENY` all inbound traffic to such a subnet except that which originates in the `App` subnet for the same VPC.


#### Central VPC
The Central VPC is a network for localizing operational infrastructure that may be needed across the Organization, such as code repositories, artifact repositories, and notably, the managed Directory Service (Microsoft AD). Instances that are domain joined will connect to this AD domain - a network flow that is made possible from anywhere in the network structure due to the inclusion of the Central VPC in all relevant association TGW RTs.

It is recommended that the Central VPC use a [RFC1918][1918] range (e.g. `10.1.0.0/16`) for the purposes of routing from the workload VPCs, and a secondary range from the [RFC6598][6598] block (e.g. `100.96.252.0/23`) to support the Microsoft AD workload.

Note that this VPC also contains a peering relationship to the `ForSSO` VPC in the master account. This exists purely to support connectivity from an AD-Connector instance in the master account, which in turn enables AWS SSO for federated login to the AWS control plane.

![Central](./images/central.drawio.png)

##### Domain Joining

An EC2 instance deployed in the Workload VPCs can join the domain corresponding to the Microsoft AD in `Central` provided the following conditions are all true:

1. The instance needs a network path to the Central VPC (given by the Segregated TGW RT), and appropriate security group assignment
2. The Microsoft AD should be 'shared' with the account the EC2 instance resides in (The Accelerator Architecture recommends these directories are shared  to workload accounts)
3. The instance has the AWS managed policies `AmazonSSMManagedInstanceCore` and `AmazonSSMDirectoryServiceAccess` attached to its IAM role, or runs under a role with at least the permission policies given by the combination of these two managed policies.
4. The EC2's VPC has an associated resolver rule that directs DNS queries for the AD domain to the Central VPC.


#### Sandbox VPC
A sandbox VPC, not depicted, may be included in the architecture. This is **not** connected to the Transit Gateway, Perimeter VPC, on-premises network, or other common infrastructure. It contains its own Internet Gateway, and is an entirely separate VPC with respect to the rest of the architecture.

The sandbox VPC should be used exclusively for time-limited experimentation, particularly with out-of-region services, and never used for any line of business workload or data.

<a name="AA"/>

## 4. Authorization and Authentication
The Accelerator Architecture makes extensive use of AWS authorization and authentication primitives from the Identity and Access Management (IAM) service as a means to enforce the guardrailing objectives of the architecture, and govern access to the set of accounts that makes up the Organization.

### Relationship to the Master Account

AWS accounts, as a default position, are entirely self-contained with respect to IAM principals - their Users, Roles, Groups are independent and scoped only to themselves. Accounts created by AWS Organizations deploy a default role with a trust policy back to the master. By default, this role is named the `OrganizationAccountAccessRole`; by contrast, the Accelerator recommends that this role by replaced by `AWSCloudFormationStackSetExecutionRole`:


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

As discussed, the AWS Organization resides in the master account. This account is not used for workloads and is primarily a gateway to the entire cloud footprint for a high-trust principal. This is realized via the `AWSCloudFormationStackSetExecutionRole` role. It is therefore crucial that the master account root credentials be handled with extreme diligence, and with a U2F hardware key enabled as a second-factor (and stored in a secure location such as a safe).

### Break Glass Accounts
Given the Organizational-wide trust relationship in the `AWSCloudFormationStackSetExecutionRole` and its broad exclusion from SCPs (discussed below), the assumption of this role grants 'super admin' status, and is thus an extremely high privilege operation. The ability to assume this role should be considered a 'break glass' capability - to be used only in extraordinary circumstances. Access to this role can be granted by IAM Users or IAM Roles in the master account (via SSO) - as with the master root account credentials, these should be handled with extreme diligence, and with a U2F hardware key enabled as a second-factor (and stored in a secure location such as a safe).


### Control Plane Access via AWS SSO
The vast majority of end-users of the AWS cloud within the Organization will never use or interact with the master account, or indeed the root users of any child account in the Organization. The Architecture recommends instead that AWS SSO be provisioned in the master account (a rare case where master account deployment is mandated).

Users will login to AWS via the web-based endpoint for the AWS SSO service:

![SSO](./images/sso.drawio.png)

Via an AWS Directory Connector deployed in the master account, AWS SSO will authenticate the user based on the underlying Microsoft AD installation (in the Central account). Based on group membership, the user will be presented with a set of roles to assume into those accounts. For example, a developer may be placed into groups that permit `Admin` access in the `Dev` account and `Readonly` access in `Test`; meanwhile an IT Director may have high-privilege access to most, or all, accounts. In effect, AWS SSO adds SAML IdP capabilities to the AWS Managed Microsoft AD, with the AWS Console acting as a service-provider (SP) in SAML parlance. Other SAML-aware SPs may also be used with AWS SSO.

#### SSO User Roles
AWS SSO creates an identity provider (IdP) in each account in the Organization. The roles used by end users have a trust policy to this IdP. When a user authenticates to AWS SSO (via the underlying AD Connector) and selects a role to assume based on their group memmership, the SSO service provides the user with temporary security credentials unique to the role session. In such a scenario, the user has no long term credentials (e.g. password, or access keys) and instead uses their temporary security credentials.

Users, via their AD group membership, are ultimately assigned to SSO User Roles via the use of AWS SSO Permission Sets. A permission set is an assignment of a particular permission policy to a set of accounts. For example:

An organization might decide to use **AWS Managed Policies for Job Functions** that are located within the SSO service as the baseline for role-based-access-control (RBAC) separation within an AWS account. This enables job function policies such as:

* **Administrator** - This policy grants almost all actions for all AWS services and for all resources in the account.
*	**Developer Power User** - This user performs application development tasks and can create and configure resources and services that support AWS aware application development.
*	**Database Administrator** - This policy grants permissions to create, configure, and maintain databases. It includes access to AWS database services, such as Amazon DynamoDB, Amazon Relational Database Service (RDS), and Amazon Redshift.
* **View-Only User** - This policy grants `List*`, `Describe*`, `Get*`, `View*`, and `Lookup*` access to resources for most AWS services.

#### Principal Authorization

Having assumed a role, a user’s permission-level within an AWS account with respect to any API operation is governed by the IAM policy evaluation logic flow ([detailed here][iam_flow]):

![IAM-policy](./images/iam-policy-evaluation.png)

Having an `Allow` to a particular API operation from the Role (i.e. Session Policy) does not necessarily imply that API operation will succeed. As depicted above, **Deny** may result due to another evaluation stage in the logic; for example a restrictive permission boundary or an explicit `Deny` at the Resource or SCP (account) level. SCPs are used extensively as a guardrailing mechanism in the Architecture, and are discussed in a later section.

###	Root Authorization
Root credentials for individual accounts in an AWS organization may be created on demand via a password reset process on the unique account email address; however, the Accelerator architecture specifically denies this via SCP. Root credentials authorize all actions for all AWS services and for all resources in the account (except anything denied by SCPs). There are some actions which only root has the capability to perform which are found within the [AWS online documentation][root]. These are typically rare operations (e.g. creation of X.509 keys), and should not be required in the normal course of business. Any root credentials, if ever they need to be created, should be handled with extreme diligence, with U2F MFA enabled.

### Service Roles
A service role is an IAM Role that a service assumes to perform actions in an account on the user’s behalf. When a user sets up AWS service environments, the user must define an IAM Role for the service to assume. This service role must include all the permissions that are required for the service to access the AWS resources that it needs. Service roles provide access only within a single account and cannot be used to grant access to services in other accounts. Users can create, modify, and delete a service role from within the IAM service. For example, a user can create a role that allows Amazon Redshift to access an Amazon S3 bucket on the user’s behalf and then load data from that bucket into an Amazon Redshift cluster. In the case of SSO, during the process in which AWS SSO is enabled, the AWS Organizations service grants AWS SSO the necessary permissions to create subsequent IAM Roles.

### Service Control Policies

Service Control Policies are a key preventative control recommended by the Accelerator Architecture. It is crucial to note that SCPs, by themselves, never _grant_ permissions. They are most often used to `Deny` certain actions at a root, OU, or account level within an AWS Organization. Since `Deny` always overrides `Allow` in the IAM policy evaluation logic, SCPs can have a powerful effect on all principals in an account, and can wholesale deny entire categories of actions irrespective of the permission policy attached to the principal itself - even the root user of the account.

SCPs follow an inheritance pattern from the root of the Organization:

![SCPs](./images/scp-venn.png)

In order for any principal to be able to perform an action A, it is necessary (but not sufficient) that there is an `Allow` on action A from all levels of the hierarchy down to the account, and no explicit `Deny` anywhere. This is discussed in further detail in [How SCPs Work][scps].

The Accelerator Architecture recommends the following SCPs in the Organization:

#### PBMM Only
This is a comprehensive policy whose main goal is to provide a PBMM-compliant cloud environment, namely prohibiting any non-centralized networking, and mandating data residency in Canada. It should be attached to all non-`Unclass` OUs.

| Policy Statement ID (SID) | Description |
| --- | --- |
| `DenyNetworkPBMMONLY` | Prevents the creation of any networking infrastructure in the workload accounts such as VPCs, NATs, VPC peers, etc. |
| `DenyAllOutsideCanadaPBMMONLY` | Prevents the use of any service in any non-Canadian AWS region with the exception of services that are considered global; e.g. CloudFront, IAM, STS, etc |
| `ScopeSpecificGlobalActionsToCanadaUSE1` | Within services that are exempted from `DenyAllOutsideCanadaPBMMONLY`, scope the use of those services to the `us-east-1` region |

#### PBMM Unclass Only
This is broadly similar to `PBMM Only`; however it relaxes the requirement for Canadian region usage, and does not prohibit network infrastructure creation (e.g. VPCs, IGWs). This is appropriate for OUs in which AWS service experimentation is taking place.

| Policy Statement ID (SID) | Description |
| --- | --- |
| `DenyUnclass` | Prevents the deletion of KMS encryption keys and IAM password policies |
| `DenyAllOutsideCanadaUS` | Prevents the use of any service in any region that is not `ca-central-1` or `us-east-1`, with the exception of services that are considered global; e.g. CloudFront, IAM, STS, etc |

#### PBMM Guardrails (Parts 1 and 2)
PBMM Guardrails apply across the Organization. These guardrails protect key infrastructure, mandate encryption at rest, and prevent other non-PBMM configurations. Note that this guardrail is split into two parts due to a current limitation of SCP sizing, but logically it should be considered a single policy.

| Policy Statement ID (SID) | Description |
| --- | --- |
| `DenyTag1` | Prevents modification of any protected security group |
| `DenyTag2` | Prevents modification of any protected IAM resource |
| `DenyS3` | Prevents modification of any S3 bucket used for Accelerator purposes |
| `ProtectCloudFormation` | Prevents modification of any CloudFormation stack used for Accelerator purposes |
| `DenyAlarmDeletion` | Prevents modification of any cloudwatch alarm used to alert on significant control plane events |
| `ProtectKeyRoles` | Prevents any IAM operation on Accelerator IAM roles |
| `DenySSMDel` | Prevents modification of any ssm resource used for Accelerator purposes  |
| `DenyLogDel` | Prevents the deletion of any log resource in Cloudwatch Logs |
| `DenyLeaveOrg` | Prevents an account from leaving the Organization |
| `DenyLambdaDel` | Prevents the modification of any guardrail Lambda function |
| `BlockOther` | Prevents miscellaneous operations; e.g. Deny `ds:DisableSso` |
| `BlockMarketplacePMP` | Prevents the modification or creation of a cloud private marketplace |
| `DenyRoot` | Prevents the use of the root user in an account |
| `EnforceEbsEncryption` | Enforces the use of volume level encryption in running instances |
| `EnforceEBSVolumeEncryption` | Enforces the use of volume level encryption with EBS |
| `EnforceRdsEncryption` | Enforces the use of RDS encryption |
| `EnforceAuroraEncryption` | Enforces  the use of Aurora encryption |
| `DenyRDGWRole` | Prevents the modification of a role used for Remote Desktop Gateway |
| `DenyGDSHFMAAChange` | Prevents the modification of GuardDuty & Security Hub |

##### Encryption at Rest
Note that the `*Encryption*` SCP statements above, taken together, mandate encryption at rest for block storage volumes used in EC2 and RDS instances.

#### Quarantine Deny All

This policy can be attached to an account to 'quarantine' it - to prevent any AWS operation from taking place. This is useful in the case of an account with credentials which are believed to have been compromised.

| Policy Statement ID (SID) | Description |
| --- | --- |
| `DenyAllAWSServicesExceptBreakglassRoles` | Blanket denial on all AWS control plane operations for all non-break-glass roles |

#### Quarantine New Object

This policy is applied to new accounts upon creation. After the installation of guardrails, it is removed. In the meantime, it prevents all AWS control plane operations except by principals required to deploy guardrails.

| Policy Statement ID (SID) | Description |
| --- | --- |
| `DenyAllAWSServicesExceptBreakglassRoles` | Blanket denial on all AWS control plane operations for all non-break-glass roles |

<a name="LM"/>
## 5. Logging and Monitoring

The Accelerator architecture recommends the following detective controls across the Organization. These controls, taken together, provide a comprehensive picture of the full set of control plane and data plane operations across the set of accounts.

### CloudTrail
A CloudTrail Organizational trail should be deployed into the Organization. For each account, this captures management events and optionally S3 data plane events taking place by every principal in the account. These records are sent to an S3 bucket in the log archive account, and the trail itself cannot be modified or deleted by any principal in any child account. This provides an audit trail for detective purposes in the event of the need for forensic analysis into account usage. The logs themselves provide an integrity guarantee: every hour, CloudTrail produces a digest of that hour's logs files, and signs with its own private key. The authenticity of the logs may be verified using the corresponding public key. This process is [detailed here][ct-digest].

### VPC Flow Logs
VPC Flow Logs capture information about the IP traffic going to and from network interfaces in an AWS Account VPC such as source and destination IPs, protocol, ports, and success/failure of the flow. The Accelerator Architecture recommends enabling `ALL` (i.e. both accepted and rejected traffic) logs for all VPCs in the Shared Network account with an S3 destination in the log-archive account. More details about VPC Flow Logs are [available here][flow].

Note that certain categories of network flows are not captured, including traffic to and from Traffic to and from `169.254.169.254` for instance metadata, and DNS traffic with an Amazon VPC resolver.

### GuardDuty
Amazon GuardDuty is a threat detection service that continuously monitors for malicious activity and unauthorized behavior to protect your AWS accounts and workloads. The service uses machine learning, anomaly detection, and integrated threat intelligence to identify and prioritize potential threats. GuardDuty uses a number of data sources including VPC Flow Logs and CloudTrail logs.

The Accelerator Architecture recommends enabling GuardDuty [at the Organization level][gd-org], and delegating the security account as the GuardDuty master. The GuardDuty master should be auto-enabled to add new accounts as they come online. Note that this should be done in every region as a defense in depth measure, with the understanding that the PBMM SCP will prevent service usage in all other regions.

### Config
[AWS Config][config] provides a detailed view of the resources associated with each account in the AWS Organization, including how they are configured, how they are related to one another, and how the configurations have changed on a recurring basis. Resources can be evaluated on the basis of their compliance with Config Rules - for example, a Config Rule might continually examine EBS volumes and check that they are encrypted.

Config may be [enabled at the Organization][config-org] level - this provides an overall view of the compliance status of all resources across the Organization.

_Note: At the time of writing, the Config Multi-Account Multi-Region Data Aggregation sits in the master account. The Accelerator Architecture will recommend that this be situated in the security account, once that becomes easily-configurable in Organizations._

### Cloudwatch Logs
CloudWatch Logs is AWS' logging aggregator service, used to monitor, store, and access log files from EC2 instances, AWS CloudTrail, Route 53, and other sources. The Accelerator Architecture recommends that log subscriptions are created for all log groups in all workload accounts, and streamed into S3 in the log-archive account (via Kinesis) for analysis and long-term audit purposes.

### SecurityHub
The primary dashboard for Operators to assess the security posture of the AWS footprint is the centralized AWS Security Hub service. Security Hub should be configured to aggregate findings from Amazon GuardDuty, AWS Config and IAM Access Analyzers. Events from security integrations are correlated and displayed on the Security Hub dashboard as 'findings' with a severity level (informational, low, medium, high, critical).

The Accelerator Architecture recommends that certain Security Hub frameworks be enabled, specifically:

* [AWS Foundational Security Best Practices v1.0.0][found]
* [PCI DSS v3.2.1][pci]
* [CIS AWS Foundations Benchmark v1.2.0][cis]

These frameworks will perform checks against the accounts via Config Rules that are evaluated against the AWS Config resources in scope. See the above links for a definition of the associated controls.


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