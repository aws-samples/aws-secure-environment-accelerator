This section contains documentation about specific features that may require manual intervention because they can't be fully automated by this upgrade process. Review each item that applies to your environment. Several warnings that can be generated from the `convert-config` command refer to items from this section.

### System Manager Documents
ASEA deploys System Manager documents through the `global-options/ssm-automation` configuration attributes and share those documents to other accounts. The configuration converter generates corresponding configuration with the `ssmAutomation` attribute in the `security-config.yaml` to re-create those documents through LZA.

The upgrade process does not remove the ASEA created documents, you need to review and remove them manually if needed. The documents created by ASEA are named `ASEA-<document-name>` and owned by the operations account. Those created by LZA are named `ASEA-LZA-<document-name>` and owned by the security account.

### rsyslog servers
!!! note "convert-config warning message"

    _rsyslog servers are deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade._

ASEA can deploy rsyslog servers with an auto-scaling group and Network Load Balancer. These rsyslog servers are configured to forward logs to a CloudWatch log group. They are not designed to store long term data and can then be replaced with minimal impact.

During the upgrade the existing deployed resources are not modified and remain in the original ASEA CloudFormation stacks. No LZA configuration elements are generated automatically for rsyslog.

We recommend that you provision new rsyslog servers and NLB with LZA, reconfigure any appliance that send logs to these servers with the new NLB address and then decommission the resources provisioned by ASEA once you confirm all traffic is sent to the new servers.

#### How to deploy rsyslog servers with LZA?
To deploy rsyslog servers with LZA you can leverage the [applications customization](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/interfaces/___packages__aws_accelerator_config_lib_models_customizations_config.IAppConfigItem.html) capability. A [sample](https://github.com/aws-samples/landing-zone-accelerator-on-aws-for-cccs-medium/tree/main/reference-artifacts/third-party/fortinet?ref_type=heads#sample-customizations-configyaml-file) is available in the LZA CCCS Medium reference architecture.

#### How to remove the ASEA deployed rsyslog servers?

Once you confirm the rsyslog servers deployed from ASEA are no longer in use, you can delete them by running the following command from the migration tool to flag the rsyslog to be deleted and then run the LZA pipeline. They will be deleted in the `ImportAseaResources` stage of the pipeline.

```
yarn run post-migration remove-rsyslog
```

### Third-Party firewalls
!!! note "convert-config warning message"
    _Third-Party firewalls ${firewall.name} are deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade._

Third-Party firewall appliances (such as FortiGate) can be deployed by ASEA and once deployed and configured their lifecycle are managed outside of the accelerator (i.e. patching and configuration changes are handled directly through the appliance UI or CLI).

During the upgrade, the existing deployed resources are not modified and remain in the original ASEA CloudFormation stacks. The firewalls can continue to be managed as before (i.e. outside the accelerator) and no other actions are needed in relation to the upgrade.

During the configuration conversion a `firewalls/instances` configuration block is added to the customizations-config.yaml file to allow the use of ${ACCEL_LOOKUP} variables in the network-config.file to reference the firewall instances.

#### Which configuration changes to ASEA Firewall instances are supported from LZA?

Only removing the Firewalls from the configuration file to decommission them is supported. Any other changes to the configuration (i.e. change the AMI used) will be ignored by the accelerator.

### Application Load Balancers
ASEA has the ability to deploy ALBs in individual accounts (e.g. Perimeter account) or be configured at the OU level to deploy ALB in every accounts of the OU.

During upgrade, the existing deployed resources are not modified and remain in the original ASEA CloudFormation stacks.

The recommendation is to create new ALBs through LZA, reconfigure the workloads to use them, and then decommission the ASEA ALBs.

#### Which configuration changes to ASEA Application Load Balancers are supported from LZA?
The ASEA ALBs are not converted to the LZA configuration files, no changes are supported through LZA pipeline. You can modify ASEA ALB properties, modify and add rules to ALB listeners or change target groups directly through the AWS console or APIs.

Once you redeploy new ALBs with LZA those can be managed through the regular LZA configuration files.

#### How to define ALB to be created in every workload account of an OU?
To achieve the same pattern than ASEA where ALB are defined at the OU level and deployed in every workload account of the OU, you can refer to this [example configuration](https://github.com/aws-samples/landing-zone-accelerator-on-aws-for-cccs-medium/blob/12859310469d7d677bcdd367f0014fca0d641f82/config/network-config.yaml#L889) from the LZA CCCS Medium reference architecture.

#### How to remove ASEA deployed Application Load Balancers?
In the future a`post-migration` command will be added to the LZA upgrade tool to remove ASEA Application Load Balancers. At the moment if you need to remove ASEA ALBs once you confirm they are are no longer in use you can do it through the AWS console or APIs.


### ALB IP Forwarder

If you are using ALB IP Forwarding in ASEA, (`"alb-forwarding": true` is set for a VPC in the ASEA configuration file), the following will occur as a result of the config-converter script:

- The AlbIpForwardingStack.template.json CloudFormation stack will be added to the LZA Configuration CodeCommit repository under the cloudformation path. ex: cloudformation/AlbIpForwardingStack.template.json
- The VPC Name containing the front-end ALBs will be determined (i.e. Perimeter VPC)
- A `customizations-config.yaml` file will be generated in the LZA Configuration CodeCommit repository in the root directory.
- In the `customizations-config.yaml` file, the following entry will be added for each VPC with ALB Forwarding enabled to the `customizations/cloudFormationStacks` section of the configuration:

```
    - name: <AcceleratorPrefix>-AlbIPForwardingStack
      template: cloudformation/AlbIpForwardingStack.template.json
      runOrder: 1
      parameters:
        - name: acceleratorPrefix
          value: <AcceleratorPrefix>
        - name: vpcName
          value: <VPC_NAME>
        terminationProtection: true
        deploymentTargets:
          accounts:
            - Perimeter
        regions:
          - ca-central-1
```

Once the Customizations stage of the pipeline has been successfully run with the configuration file above, a new DynamoDB table will be generated in the `deploymentTargets` account and region specified. This table should be named `Alb-Ip-Forwarding-<VPC_NAME>`. In the same region and account, a DynamoDB table named `<ASEA-Prefix>-Alb-Ip-Forwarding-<VPC-ID>` should exist. You will need to copy over all of these entries from the old ALB IP Forwarding table to the new one.



For more details about ALB Forwarding in LZA, refer to the [post-deployment instructions of LZA CCCS Medium reference architecture](https://github.com/aws-samples/landing-zone-accelerator-on-aws-for-cccs-medium/blob/main/post-deployment.md#44-configure-application-load-balancer-forwarding).

### Managed Active Directory
!!! note "convert-config warning message"
    _Managed AD is deployed in ${accountKey}. Please refer to documentation on how to manage these resources after the upgrade._

During the upgrade the existing Managed Active Directory resource is not modified, remain in the original ASEA CloudFormation stacks and you can continue to managed Active Directory objects through the Windows AD Management Tool from any instance joined to the domain.

#### Is there still an AD EC2 management instance (i.e. RDGW) created?
The management instance created by ASEA using the ASEA-RDGWAutoScalingGroup will still be present and you can continue to use it to manage the Active Directory objects.

#### Which configuration changes to ASEA Managed AD are supported from LZA configuration?
No changes to the Managed AD resources created by ASEA are supported through the LZA configuration. The configuration converter doesn’t generate any corresponding block in LZA configuration.

LZA configurations support the creation of new Managed Active Directory using the [ManagedActiveDirectoryConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/interfaces/___packages__aws_accelerator_config_dist_config_lib_models_iam_config.IManagedActiveDirectoryConfig.html) configuration. Do not declare a `managedActiveDirectories` block in your LZA configuration with the same domain than the one created in ASEA, this will be ignored.

#### How to decommission a Managed Active Directory that was deployed by ASEA?
The resources need to be decommissioned manually.  In the future a flag could be added to the `post-migration` command to flag the resources for removal.


### Gateway Load Balancer
!!! note "convert-config warning message"
    _The account ${accountKey} utilizes a Gateway Load Balancer: ${loadBalancerItem.name}. Please refer to documentation on how to manage these resources._ or _The organizational unit ${ouKey} utilizes a Gateway Load Balancer: ${loadBalancerItem.name}. Please refer to documentation on how to manage these resources._


If you are using Gateway Load Balancers (GWLB) in ASEA, (`"type: "GWLB"` is set for one of your Load Balancers in the `alb` configuration), the configuration tool will not map the existing GWLB in ASEA to the LZA configuration.

!!! warning
    Review the FAQ entry [Gateway Load Balancer are not supported in the configuration conversion, how will this impact the workload availability?](../faq.md#gateway-load-balancer-are-not-supported-in-the-configuration-conversion-how-will-this-impact-the-workload-availability) to assess the potential impact of your workload availability during the upgrade.

If you're looking to implement GWLBs in your environment, you can do so by referencing the central network services [configuration](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/interfaces/___packages__aws_accelerator_config_dist_config_lib_models_network_config.ICentralNetworkServicesConfig.html) within LZA. The LZA configuration allows end-users to define multiple GWLBs and VPC and subnets of where these resources are provisioned. End-users can also define which subnets the service endpoints are distributed to.

To set up GWLBs in your LZA environment, reference the `network-config.yaml` file and specify the `gatewayLoadBalancers` configuration within the `centralNetworkServices` configuration:

```
gatewayLoadBalancers:
  - name: <AcceleratorPrefix>-GWLB
    subnets:
      - Network-Inspection-Firewall-A
      - Network-Inspection-Firewall-B
    account: Network
    vpc: Network-Inspection
    deletionProtection: true
    endpoints:
      - name: Endpoint-A
        account: Network
        subnet: Network-Inspection-A
        vpc: Network-Inspection
      - name: Endpoint-B
        account: Network
        subnet: Network-Inspection-B
        vpc: Network-Inspection

```

### Gateway Load Balancer Endpoint Routes

To specify routes to the GWLB for inspection, reference the Subnet route tables [configuration](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/interfaces/___packages__aws_accelerator_config_dist_config_lib_models_network_config.IRouteTableEntryConfig.html) within LZA, for example taking in the above configuration:

```
- name: GwlbRoute
  destination: 0.0.0.0/0
  type: gatewayLoadBalancerEndpoint
  target: Endpoint-A
```

### Custom IAM Role Trust Policies
!!! note "convert-config warning message"
    _The trust policy for the role ${role.role} ... Please refer to documentation on how to manage these resources._


The LZA solution supports multiple types of assumeRole policies. The following are supported with their respective LZA configurations, particularly as it relates to the `assumedBy` property for the IAM Role set configuration:

##### Using a policy to delegate access to AWS services:

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "elasticmapreduce.amazonaws.com",
          "datapipeline.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

LZA configuration:

```
- name: EC2-Role
  instanceProfile: true
  assumedBy:
    - type: service
      principal: elasticmapreduce.amazonaws.com
    - type: service
      principal: datapipeline.amazonaws.com
  policies:
    awsManaged:
      - AmazonElasticMapReduceFullAccess
      - AWSDataPipeline_PowerUser
      - CloudWatchAgentServerPolicy
  boundaryPolicy: Default-Boundary-Policy
```

##### Using a policy to delegate access to all principals in an account.

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:root"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

LZA configuration:

```
- name: EC2-Readonly-Role
  assumedBy:
    - type: account
      principal: '123456789012'
  policies:
    awsManaged:
      - AmazonEC2ReadOnlyAccess
```

##### Using a policy to delegate access to cross-account principals

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/test-access-role"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

LZA configuration:

```
- name: Network-Security-Role
  assumedBy:
    - type: principalArn
      principal: 'arn:aws:iam::444455556666:role/test-access-role'
  policies:
    awsManaged:
      - AmazonSSMManagedInstanceCore
      - AmazonEC2ReadOnlyAccess
  boundaryPolicy: Default-Boundary-Policy
```

##### Using a policy to provide 3rd party access via external ID conditionals

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/test-access-role"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "111122223333",
        },
      },
    }
  ]
}
```

LZA configuration:

```
- name: Network-Security-Role
  assumedBy:
    - type: principalArn
      principal: 'arn:aws:iam::444455556666:role/test-access-role'
  externalIds:
    - 111122223333
  policies:
    awsManaged:
      - AmazonSSMManagedInstanceCore
      - AmazonEC2ReadOnlyAccess
  boundaryPolicy: Default-Boundary-Policy
```

#### Using a SAML Provider to Federate:

```
{
    "Version": "2012-10-17",
    "Statement": {
      "Effect": "Allow",
      "Action": "sts:AssumeRoleWithSAML",
      "Principal": {"Federated": "arn:aws:iam::account-id:saml-provider/Test-SAML"},
      "Condition": {"StringEquals": {"SAML:aud": "https://signin.aws.amazon.com/saml"}}
    }
  }

```

LZA Configuration:

```
providers:
  - name: Test-SAML
    metadataDocument: path/to/metadata.xml

- name: Network-Security-Role
  assumedBy:
    - type: provider
      principal: Test-SAML
  externalIds:
    - 111122223333
  policies:
    awsManaged:
      - AmazonSSMManagedInstanceCore
      - AmazonEC2ReadOnlyAccess
  boundaryPolicy: Default-Boundary-Policy
```

If an assume role policy is needed outside of the scope of what's natively supported in LZA, it's recommended to lean on LZA to provision the IAM Role and trust policy through the customizations layer:

- Create your own CloudFormation template and add it to the `customizations-config.yaml` file, which will be generated in the LZA Configuration CodeCommit repository in the root directory.

#### Microsoft Sentinel Role

If you created a role for Microsoft Sentinel S3 Connector [using the ASEA documentation](https://aws-samples.github.io/aws-secure-environment-accelerator/latest/faq/#how-do-i-create-a-role-for-use-by-azure-sentinel-using-the-new-s3-connector-method), the trust policy format is not supported by LZA and won't be converted properly. Microsoft now recommends to [Create an Open ID Connect (OIDC) web identity provider and an AWS assumed role](https://learn.microsoft.com/en-us/azure/sentinel/connect-aws?tabs=s3#create-an-open-id-connect-oidc-web-identity-provider-and-an-aws-assumed-role) instead of the previous trust policy that trusted an external Microsoft managed AWS account.

We recommend creating a new role (outside ASEA/LZA) based on the latest recommendation and update your Microsoft Sentinel S3 Connector with the new role ARN. Once you confirm the connector work as expected with the new role, you can decommission the previous role that was deployed by ASEA to avoid any issues during the upgrade.

### Public and Private Hosted Zones
!!! note "convert-config warning message"
    _The VPC ${vpcItem.name} in account ${accountKey} utilizes a public Route53 zone: ${zone}. Please refer to documentation on how to manage these resources._ or _The VPC ${vpcItem.name} in OU ${ouKey} utilizes a public Route53 zone: ${zone}. Please refer to documentation on how to manage these resources._

In ASEA you can create Route53 Public and Private Hosted Zone through the configuration file. Once the zone is created you need to manage its records outside of the accelerator.

e.g.
```
"zones": {
  "public": [
    "cloud-hosted-publicdomain.example.ca"
  ],
  "private": [
    "cloud-hosted-privatedomain.example.ca"
  ]
},
```

As of right now, LZA only supports the creation of private hosted zones in association with creating Vpc Interface Endpoints (for centralized distribution) as well as for Route 53 Resolver Rules. It does not support the creation of custom public or private hosted zone.

After the upgrade to LZA you can continue to manage records in the existing zones. To create new Route53 zones you will need to create your own CloudFormation template and add it to the `customizations-config.yaml` file, which will be generated in the LZA Configuration CodeCommit repository in the root directory.

### VPC Templates
!!! note "convert-config warning message"
    _The VPC ${vpcItem.name} in OU ${ouKey} is set to deploy 'local' in each account. You need to add a vpcTemplate to your configuration to keep the same behavior for new accounts in this OU._

In ASEA you can define a VPC at the OU level with a `local` deployment. This can be used with dynamic or provided CIDR ranges.

For example, this is used in the sample config file to create local VPC in each Sandbox account.
```
"vpc": [
  {
    "deploy": "local",
    "name": "${CONFIG::OU_NAME}",
    "description": "This VPC is deployed locally in each Sandbox account and each account/VPC is deployed with the same identical CIDR range.  This VPC has no access to the rest of the Organizations networking and has direct internet access and does not use the perimeter ingress/egress services.",
    "cidr-src": "dynamic",
    "cidr": [
      {
        "size": 16,
        "pool": "main"
      }
    ]
  ...
```

During the upgrade, each existing account using this feature will have its own VPC added to the configuration with the current CIDR range assigned to the VPC. To allow the creation of new accounts in this OU with a local VPC with a similar behavior than ASEA you need to add a [vpcTemplate](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/interfaces/___packages__aws_accelerator_config_dist_config_lib_models_network_config.IVpcTemplatesConfig.html) to your configuration.

Example using a provided CIDR range:
```
vpcTemplates:
  - name: Sandbox-Template
    region: {{ AcceleratorHomeRegion }}
    deploymentTargets:
      organizationalUnits:
        - Sandbox
      excludedAccounts:
        - Sandbox01
        - Sandbox02
    cidrs:
      - 10.100.0.0/20
    internetGateway: true
    enableDnsHostnames: true
    enableDnsSupport: true
    instanceTenancy: default
    routeTables:
      - name: Network-Sandbox-A
        routes:
          - name: NatRoute
            destination: 0.0.0.0/0
            type: natGateway
            target: Nat-Network-Sandbox-A
          - name: S3Gateway
            type: gatewayEndpoint
            target: s3
          - name: DynamoDBGateway
            type: gatewayEndpoint
            target: dynamodb
      - name: Network-Sandbox-B
        routes:
          - name: NatRoute
            destination: 0.0.0.0/0
            type: natGateway
            target: Nat-Network-Sandbox-B
          - name: S3Gateway
            type: gatewayEndpoint
            target: s3
          - name: DynamoDBGateway
            type: gatewayEndpoint
            target: dynamodb
      - name: Network-Sandbox-Nat-A
        routes:
          - name: IgwRoute
            destination: 0.0.0.0/0
            type: internetGateway
            target: IGW
      - name: Network-Sandbox-Nat-B
        routes:
          - name: IgwRoute
            destination: 0.0.0.0/0
            type: internetGateway
            target: IGW
    subnets:
      - name: Network-Sandbox-A
        availabilityZone: a
        routeTable: Network-Sandbox-A
        ipv4CidrBlock: 10.100.0.0/24
      - name: Network-Sandbox-B
        availabilityZone: b
        routeTable: Network-Sandbox-B
        ipv4CidrBlock: 10.100.1.0/24
      - name: Network-SandboxNat-A
        availabilityZone: a
        routeTable: Network-Sandbox-Nat-A
        ipv4CidrBlock: 10.100.2.0/28
      - name: Network-SandboxNat-B
        availabilityZone: b
        routeTable: Network-Sandbox-Nat-B
        ipv4CidrBlock: 10.100.2.16/28
    natGateways:
      - name: Nat-Network-Sandbox-A
        subnet: Network-SandboxNat-A
      - name: Nat-Network-Sandbox-B
        subnet: Network-SandboxNat-B
    gatewayEndpoints:
      defaultPolicy: Default
      endpoints:
        - service: s3
        - service: dynamodb
```

!!! warning "Existing accounts"
    It is important to add the existing accounts that were upgraded from ASEA to the `deploymentTargets/excludedAccounts` list to avoid creating new VPC into the existing accounts.

### Custom AWS Config Rules
!!! note "convert-config warning message"
    _Custom AWS Config Rule with detection needs an IAM policy written Rule Name: "${configRule.name}".  Policy file name: "${detectionPolicyPath}_ or _Custom AWS Config Rule with remediation needs an IAM policy written Rule Name: "${configRule.name}".  Policy file name: "${remediationPolicyPath}_

Custom AWS Config Rules need to have the appropriate permissions to execute the detection Lambda and the remediation SSM Documents. The way those permissions are provided are different between ASEA and LZA.

During the configuration conversion process, empty policy files will be generated under the `custom-config-rules` folder. You need to provide the appropriate policies in those files prior to the LZA installation. LZA will create the IAM Roles with the permissions provided in those files that are referenced with the `rolePolicyFile` property in `security-config.yaml`. The `AutomationAssumeRole` parameter is automatically provided by LZA with the created role to the remediation document and no longer should be provided as an explicit parameter.


### Suspended accounts
All suspended accounts in your organization should be under a specific OU that is ignored by the accelerator.

See [ASEA FAQ 1.1.0 How do I suspend an AWS account?](https://aws-samples.github.io/aws-secure-environment-accelerator/latest/faq/#how-do-i-suspend-an-aws-account) for more details.

The presence of Suspended accounts in _regular_ OUs (i.e. Dev, Test, Prod) will generate errors during the upgrade.