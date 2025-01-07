# Key differences between ASEA and LZA

This section highlights key differences between ASEA and LZA. For futher documentation please refer to [Landing Zone Accelerator on AWS solution documentation](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/)


## Accelerator prefix

ASEA by default uses the `ASEA` prefix to identify resources deployed by the accelerator and protect them through SCPs. When LZA is installed during the upgrade process it keeps the existing prefix for existing and new resources to ensure compatibility with the guardrails and uniformity across resources created by ASEA and LZA.

This is different than the default prefix used by LZA (`AWSAccelerator`).

## Pipeline execution role

ASEA used the `ASEA-PipelineRole` as the privileged role deployed to all accounts and used by the accelerator to manage resources. The LZA upgraded environement used the  `ASEA-LZA-DeploymentRole`. This is defined with this configuration in the global-config.yaml file.


```
cdkOptions:
  centralizeBuckets: true
  useManagementAccessRole: false
  customDeploymentRole: ASEA-LZA-DeploymentRole
```

## Service Control Policies (SCP)
During the upgrade, Service Control Policies are kept as-is and not modified. You retain all existing customizations. If you customized the SCPs in ASEA, review your changes to ensure that resources deployed by the accelerator can be modified by the accelerator Pipeline role.  This is achieved by having the Organization Admin Role and <ACCELERATOR_PREFIX>-PipelineRole listed in several SCP conditions such as:
```
"Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": ["arn:aws:iam::*:role/${ACCELERATOR_PREFIX}*", "arn:aws:iam::*:role/${ORG_ADMIN_ROLE}"]
        }
      }
```
Verify you have not removed those in your customizations before starting the upgrade.

## SSM Parameters to reference accelerator resources

Both accelerators make extensive use of SSM Parameters to store the id of resources created by the accelerator and reference them from other CloudFormation stacks. Most of this behavior is internal to the accelerator and transparent to the end-user.

If you deployed your own customizations using those accelerator created SSM Parameters or reference them in your own Infrastructure as Code, you need to be aware of structural differences between ASEA and LZA parameters.

For example several parameters are created to reference networking resources.

* In ASEA the parameters use a numerical index (e.g. `/ASEA/network/vpc/1/id` contains the ID of the first VPC deployed in the account and `/ASEA/network/vpc/1/net/1/aza/id` contains the ID of the first subnet in AZA of the first VPC)
* In LZA the parameters are indexed by the resource name defined in the network-config.yaml file (e.g**.** `/ASEA/network/vpc/Central_vpc/id` **** contains the of the VPC named `Central_vpc` and `/ASEA/network/vpc/Central_vpc/subnet/App2_Central_aza_net/id` contains the ID of the `App2_central_aza_net` subnet from the `Central_vpc`)


Refer to the [Landing Zone Accelerator Implementation Guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/accessing-solution--outputs-through-parameter-store.html) for a full list of Parameter Store outputs supported by LZA.

## Centralized logging
LZA uses the same centralized logging architecture than ASEA to consolidate logs in a central S3 bucket in the Log Archive account. During the upgrade the configuration and dynamic partitioning rules are adapted to keep the same logging structure. If you have external integrations that depend on the logging structure and format, you should closely monitor the logs during the upgrade.

Reference: [Landing Zone Accelerator Centralized Logging](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/user-guide/logging/#log-centralization-methods)

### Log aggregation in all enabled regions
By default ASEA deploys the Kinesis Data Streams and Log Group subscription filters to send logs to the central logging bucket only to the home region. Additional regions can be configured with the [additional_cwl_regions](https://aws-samples.github.io/aws-secure-environment-accelerator/v1.5.6-a/schema/en/interfaces/GlobalOptions.html#additional_cwl_regions) property.

In LZA, the logging infrastructure is deployed to all `enabledRegions`, this will result in increased number of logs being sent to the central S3 bucket as well as the deployment of a Kinesis Data Stream and Kinesis Data Firehose in the Logging account for every enabled regions.

### Security Hub to CloudWatch logs
When Security Hub is configured to send logs to CloudWatch, in ASEA the forwarding rule and the `/ASEA/SecurityHub` CloudWatch LogGroup is created only in the logging account.

In LZA, the forwarding rule and CloudWatch Log Groups are created in every account and enabled region. This will result in additional logs being sent to CloudWatch and the centralized S3 logging bucket.


## Customer Managed Keys
There are differences between how ASEA and LZA manage AWS KMS keys to provide encryption at rest capabilities for resources deployed by the solution. Detailed documentation is available in the [Customer Managed Keys - Comparison of ASEA and LZA](./kms.md) document.

## Cost considerations
Due to architectural and operational differences between ASEA and LZA, you can see an increase of the AWS resources cost during and after the upgrade. We recommend that you monitor the costs of your environment on a daily basis to detect any anomaly.

### During the upgrade
The upgrade itself makes changes to a significant number of resources, therefore it is expected that applying the upgrade will incur a significant AWS Config cost the day the upgrade is applied. The same behavior can be seen when initially installing the accelerator or when a State Machine/pipeline run affects a large number of resources.

During the upgrade process it is expected that some resources will exist twice for some time. The ASEA created resource and the LZA created resource, until the cleanup process happens.

Both these impacts are temporary and the cost will stabilize when the upgrade is complete.

### After the upgrade
LZA has the capability to deploy and configure more services than ASEA, during the upgrade new capabilities are not deployed unless required, you can choose to enable additional services once the upgrade is complete. LZA uses more granular KMS keys than ASEA, new Customer Manager Keys will be created as part of the upgrade, the impact on your total costs depends on the number of accounts and regions in use in your environment. Review the [Customer Managed Keys - Comparison of ASEA and LZA](./kms.md) document for more details.

By default LZA consolidate more logs than ASEA to CloudWatch Logs, review the section on [Centralized logging](#centralized-logging) to understand how the additional logging can impact costs.