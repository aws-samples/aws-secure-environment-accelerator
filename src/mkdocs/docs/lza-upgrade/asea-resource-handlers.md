# ASEA Resource Handlers

In order to accomplish upgrading from ASEA to LZA, the solution relies on a concept called ASEA Resource Handlers. These resource handlers utilize the [CFN Include module](https://docs.aws.amazon.com/cdk/v2/guide/use_cfn_template.html) to allow the LZA engine to manage ASEA resources in their original CloudFormation stacks. By using the CFN Include Module, the LZA application can modify certain properties of CloudFormation constructs. The current state of supported resources can be found in the table below:

!!! note
    Refer to [Advanced Troubleshooting - Removing ASEA managed resources](./asea-resource-removal.md) for detailed instructions on how to delete ASEA resources that don't have Resource Deletion handlers in LZA.


|Resource Type	|Resource Deletion Supported	|Resource Update Supported	|Modifiable Attributes	|	|
|---	|---	|---	|---	|---	|
|Application Load Balancers	|FALSE	|FALSE	|	|	|
|EC2 Firewall Instance (Fortinet)	|FALSE	|FALSE	|	|	|
|ELB Target Group	|FALSE	|FALSE	|	|	|
|IAM Groups	|TRUE	|TRUE	|Group Name </br> Managed Policy Arns	|	|
|IAM Managed Policies	|TRUE	|TRUE	|Managed Policy Name </br> Managed Policy Document	|	|
|IAM Roles	|TRUE	|TRUE	|Permissions Boundary </br> Managed Policy Arns </br> Assume Role Policy Document </br> Instance Profile	|	|
|IAM Users	|TRUE	|TRUE	|Groups </br> Permissions Boundary	|	|
|Internet Gateway (IGW)	|FALSE	|FALSE	|	|	|
|ManagedAD	|FALSE	|FALSE	|	|	|
|NACL Subnet Associations	|FALSE	|TRUE	|NACL Id </br> Subnet Id	|	|
|NAT Gateway	|FALSE	|TRUE	|Subnet Id	|	|
|Network Firewall	|TRUE	|TRUE	|Firewall Logging Configuration	|	|
|Network Firewall Policy	|TRUE	|FALSE	|	|	|
|Network Firewall Rule Group	|TRUE	|FALSE	|	|	|
|Route53 Hosted Zone	|FALSE	|FALSE	|	|	|
|Route53 Query Logging Association	|FALSE	|FALSE	|	|	|
|Route53 Record Set	|FALSE	|FALSE	|	|	|
|Route53 Resolver Endpoint	|FALSE	|FALSE	|	|	|
|Security Groups	|FALSE	|TRUE	|Security Group Ingress Rules </br> Security Group Egress Rules	|	|
|Shared Security Group	|FALSE	|FALSE	|	|	|
|SSM Association	|FALSE	|FALSE	|	|	|
|SSM Resource Data Sync	|FALSE	|FALSE	|	|	|
|Subnets	|FALSE	|TRUE 	|Subnet CIDR Block </br> Subnet Availability Zone </br> Subnet Map Public IP on Launch	|	|
|Transit Gateway Associations	|TRUE	|TRUE	|TGW Associations that were originally owned by ASEA and are modified will be deleted in the importAseaResources stack and recreated in the Network Associations Stack <br><br> Please note that this can cause a networking outage from the time the resource is removed in importAseaResources until the resource is re-created in Network Associations	|	|
|Transit Gateway Black Hole Routes	|FALSE	|FALSE	|	|	|
|Transit Gateway Propagations	|FALSE	|FALSE	|	|	|
|Transit Gateway Route Tables	|FALSE	|FALSE	|	|	|
|Transit Gateway Routes	|FALSE	|FALSE	|	|	|
|Transit Gateways	|FALSE	|TRUE	|Amazon Side ASN </br> Auto Accept Shared Attachments </br> Default Route Table Associations </br> Default Route Table Propagations </br> DNS Support </br> VPN ECMP Support	|	|
|Virtual Private Gateway	|FALSE	|TRUE	|Amazon Side ASN	|	|
|VPC	|FALSE	|TRUE	|CIDR Blocks </br> Enable DNS Host Names </br> Enable DNS Support </br> Instance Tenancy 	|	|
|VPC Endpoint	|TRUE	|FALSE	|None, Including associated security group. Must re-create endpoint |	|
|VPC Endpoint (Gateway)	|FALSE	|TRUE	|Route Table Ids	|	|
|VPC Peering Connection	|FALSE	|FALSE	|	|	|