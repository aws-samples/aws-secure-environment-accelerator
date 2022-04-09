# Accelerator Service List

## Services

This table indicates whether services are leveraged and/or orchestrated by the Accelerator.

| CATEGORY                | SERVICE                                                          | LEVERAGED | ORCHESTRATED |
| ----------------------- | ---------------------------------------------------------------- | --------- | ------------ |
| **Compute**             |                                                                  |           |              |
|                         | AWS Lambda                                                       | X         |              |
|                         | Amazon Elastic Compute Cloud (EC2)                               |           | X            |
| **Monitoring & Alerts** |                                                                  |           |              |
|                         | Amazon CloudTrail                                                |           | X            |
|                         | AWS Config                                                       |           | X            |
|                         | Amazon CloudWatch                                                | X         | X            |
|                         | Amazon EventBridge                                               | X         | X            |
|                         | Amazon Simple Notification Service (SNS)                         | X         |              |
|                         | AWS Budgets                                                      |           | X            |
|                         | Systems Manager Inventory                                        |           | X            |
| **Infrastructure**      |                                                                  |           |              |
|                         | AWS CodeCommit                                                   | X         |              |
|                         | AWS CodeBuild                                                    | X         |              |
|                         | AWS CodePipeline                                                 | X         |              |
|                         | AWS CloudFormation                                               | X         |              |
|                         | AWS Cloud Development Kit (CDK) / Software Development Kit (SDK) | X         |              |
|                         | AWS Step Functions                                               | X         |              |
|                         | Amazon Kinesis Data Stream                                       | X         |              |
|                         | Amazon Kinesis Data Firehose                                     | X         |              |
|                         | Amazon Simple Queue Service (SQS)                                | X         |              |
| **Data**                |                                                                  |           |              |
|                         | Amazon Simple Storage Service (S3)                               | X         | X            |
|                         | Amazon DynamoDB                                                  | X         |              |
|                         | Amazon Elastic Container Registry (ECR) (incl. ECR Public)       | X         |              |
|                         | Systems Manager Parameter Store                                  | X         | X            |
|                         | AWS Secrets Manager                                              | X         |              |
| **Networking**          |                                                                  |           |              |
|                         | Amazon Virtual Private Cloud (VPC)                               |           | X            |
|                         | AWS Transit Gateway                                              |           | X            |
|                         | AWS PrivateLink                                                  |           | X            |
|                         | Elastic Load Balancer (ELB) (incl. ALB, NLB, GWLB)               |           | X            |
|                         | Route53                                                          |           | X            |
|                         | Route53 Resolver                                                 |           | X            |
| **Management**          |                                                                  |           |              |
|                         | AWS Organizations                                                | X         | X            |
|                         | AWS Resource Access Manager (RAM)                                |           | X            |
|                         | AWS Identity and Access Management (IAM)                         | X         | X            |
|                         | AWS Single Sign-On (SSO)                                         | X         |              |
|                         | AWS Directory Service (incl. AWS Managed AD and AD Connector)    |           | X            |
|                         | AWS Control Tower                                                | X         | X            |
|                         | AWS IAM Access Analyzer                                          |           | X            |
|                         | AWS Cost and Usage Reports                                       |           | X            |
|                         | AWS Service Quotas                                               |           | X            |
| **Security**            |                                                                  |           |              |
|                         | AWS GuardDuty                                                    |           | X            |
|                         | AWS Security Hub                                                 |           | X            |
|                         | Amazon Macie                                                     |           | X            |
|                         | Systems Manager Automation                                       |           | X            |
|                         | Systems Manager Session Manager                                  |           | X            |
|                         | AWS Key Management Service (KMS)                                 | X         | X            |
|                         | AWS Security Token Service (STS)                                 | X         |              |
|                         | AWS Firewall Manager                                             |           | X            |
|                         | AWS Network Firewall                                             |           | X            |
|                         | AWS Certificate Manager (ACM)                                    |           | X            |
| **Third-Party**         |                                                                  |           |              |
|                         | Fortinet FortiGate and FortiManager (Firewall & Mgmt)            |           | X            |
|                         | Checkpoint CloudGuard and Manager (Firewall & Mgmt)              |           | X            |
|                         | `rsyslog` on Amazon Linux 2                                      |           | X            |
|                         | Windows Remote Desktop Gateway Bastion                           |           | X            |

---

If we missed a service, let us know!
