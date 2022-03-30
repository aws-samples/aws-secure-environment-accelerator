# Object Naming

### Accelerator Object Naming

-   Resources will have the 'Name' tag assigned, where Name={name}{suffix}
    -   No prefix or suffix will be applied to DNS records/zones (as that breaks them)
    -   When \_ is not supported, a - will be used
-   Stacks/stacksets/functions and **_non-end user_** accessed objects deployed in all accounts will also start with the {AcceleratorPrefix} prefix (i.e. "**_PBMMAccel-_**" or "**_ASEA-_**")
    -   The prefix does not apply to objects like VPC's, subnets, or TGW's which customers need to directly access. This is for objects deployed to build the customer accessible objects
    -   This prefix will be protected by SCP's so customers don't break 'managed' features
-   Resources will have the tag 'Accelerator={AcceleratorName}' assigned when tags are supported
-   Stacks will have the tag 'AcceleratorName={AcceleratorName}' assigned, which will often (but not always) be inherited by objects created by the stack (due to TGW duplicate tag issue)

### Defaults

    - the default {AcceleratorName} is 'PBMM' before v1.5.0 and 'ASEA' after v1.5.0
    - the default {AcceleratorPrefix} is 'PBMMAccel-' before v1.5.0 and 'ASEA-' after v1.5.0

### **_Suffix's_**

| suffix    | object type               |
| --------- | ------------------------- |
| \_vpc     | VPC                       |
| \_azN_net | Subnet                    |
| \_azN_rt  | RouteTable                |
| \_tgw     | Transit Gateway           |
| \-key     | KMS key                   |
| \_pcx     | Peering Connection        |
| \_sg      | Security Group            |
| \_nacl    | NACL                      |
| \_alb     | Application Load Balancer |
| \_nlb     | Network Load Balancer     |
| \_agw     | Appliance Gateway         |
| \_vpce    | VPC Endpoint              |
| \_AMI     | AMI                       |
| \_dhcp    | DHCP option set           |
| \_snap    | snapshot                  |
| \_ebs     | Block storage             |
| \_igw     | internet gateway          |
| \_lgw     | Local gateway             |
| \_nat     | NAT gateway               |
| \_vpg     | Virtual private gateway   |
| \_cgw     | Customer gateway          |
| \_vpn     | VPN Connection            |
| \_sm      | Step Functions            |
| \_rule    | CW Event Rule             |
| \_pl      | CodeBuild                 |

### **_No Suffix_**

| suffix | object type            |
| ------ | ---------------------- |
| None   | Stacks                 |
| None   | CFN_Stack_Sets         |
| None   | Lambda                 |
| None   | Cloud Trails           |
| None   | CWL Groups             |
| None   | Config Rules           |
| None   | OU                     |
| None   | Service Control Policy |
