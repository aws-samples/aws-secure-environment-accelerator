# Design Notes

## Accelerator Design Constraints / Decisions

-   The Organization Management (root) account does NOT have any preventative controls to protect the integrity of the Accelerator codebase, deployed objects or guardrails. Do not delete, modify, or change anything in the Organization Management (root) account unless you are certain as to what you are doing. More specifically, do NOT delete, or change _any_ buckets in the Organization Management (root) account.
-   While generally protected, do not delete/update/change s3 buckets with cdk-asea-, or asea- in _any_ sub-accounts.
-   ALB automated deployments only supports Forward and not redirect rules.
-   AWS generally discourages cross-account KMS key usage. As the Accelerator centralizes logs across an entire organization as a security best practice, this is an exception/example of a unique situation where cross-account KMS key access is required.
-   Only 1 auto-deployed MAD in any mandatory-account is supported today.
-   VPC Endpoints have no Name tags applied as CloudFormation does not currently support tagging VPC Endpoints.
-   If the Organization Management (root) account coincidentally already has an ADC with the same domain name, we do not create/deploy a new ADC. You must manually create a new ADC (it won't cause issues).
-   3rd party firewall updates are to be performed using the firewall OS based update capabilities. To update the AMI using the Accelerator, you must first remove the firewalls and then redeploy them (as the EIP's will block a parallel deployment), or deploy a second parallel FW cluster and de-provision the first cluster when ready.
-   When adding more than 100 accounts to an OU which uses shared VPC's, you must _first_ increase the Quota `Participant accounts per VPC` in the shared VPC owner account (i.e. shared-network). Trapping this quota before the SM fails has been added to the backlog.
-   The default limit for Directory Sharing is 125 accounts for an Enterprise Managed Active Directory (MAD), a quota increase needs to be manually requested through support from the account containing the MAD before this limit is reached. Standard MAD has a sharing limit of 5 accounts (and only supports a small quota increase). The MAD sharing limit is not available in the Service Quota's tools.
