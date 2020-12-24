# 1. Accelerator Basic Operation and Frequently asked Questions

- [1. Accelerator Basic Operation and Frequently asked Questions](#1-accelerator-basic-operation-and-frequently-asked-questions)
  - [1.1. How do I add new AWS accounts to my AWS Organization?](#11-how-do-i-add-new-aws-accounts-to-my-aws-organization)
  - [1.2. Can I use AWS Organizations for all tasks I currently use AWS Organizations for? (Standalone Version Only)](#12-can-i-use-aws-organizations-for-all-tasks-i-currently-use-aws-organizations-for-standalone-version-only)
  - [1.3. How do I import an existing AWS account into my Accelerator managed AWS Organization (or what if I created a new AWS account with a different Organization trust role)?](#13-how-do-i-import-an-existing-aws-account-into-my-accelerator-managed-aws-organization-or-what-if-i-created-a-new-aws-account-with-a-different-organization-trust-role)
  - [1.4. How do I modify and extend the Accelerator or execute my own code after the Accelerator provisions a new AWS account or the state machine executes?](#14-how-do-i-modify-and-extend-the-accelerator-or-execute-my-own-code-after-the-accelerator-provisions-a-new-aws-account-or-the-state-machine-executes)
  - [1.5. What if my State Machine fails? Why? Previous solutions had complex recovery processes, what's involved?](#15-what-if-my-state-machine-fails-why-previous-solutions-had-complex-recovery-processes-whats-involved)
  - [1.6. How do I make changes to items I defined in the Accelerator configuration file during installation?](#16-how-do-i-make-changes-to-items-i-defined-in-the-accelerator-configuration-file-during-installation)
  - [1.7. Is there anything my end users need to be aware of?](#17-is-there-anything-my-end-users-need-to-be-aware-of)
  - [1.8. Can I upgrade directly to the latest release, or must I perform upgrades sequentially?](#18-can-i-upgrade-directly-to-the-latest-release-or-must-i-perform-upgrades-sequentially)
  - [1.9. Can I update the config file while the State Machine is running? When will those changes be applied?](#19-can-i-update-the-config-file-while-the-state-machine-is-running-when-will-those-changes-be-applied)
  - [1.10. How do I update some of the supplied sample configuration items found in reference-artifact, like SCPs and IAM policies?](#110-how-do-i-update-some-of-the-supplied-sample-configuration-items-found-in-reference-artifact-like-scps-and-iam-policies)
  - [1.11. I wish to be in compliance with the 12 TBS Guardrails, what don't you cover with the provided sample architecture?](#111-i-wish-to-be-in-compliance-with-the-12-tbs-guardrails-what-dont-you-cover-with-the-provided-sample-architecture)
  - [1.12. I deployed AWS Managed Active Directory (MAD) as part of my depoloyment, how do I manage Active Directory domain users, groups, and domain policies after deployment?](#112-i-deployed-aws-managed-active-directory-mad-as-part-of-my-depoloyment-how-do-i-manage-active-directory-domain-users-groups-and-domain-policies-after-deployment)
  - [1.13. How do I suspend an AWS account?](#113-how-do-i-suspend-an-aws-account)
  - [1.14. The Accelerator is written in CDK and deploys CloudFormation, does this restrict the Infrastructure as Code (IaC) tools that I can use?](#114-the-accelerator-is-written-in-cdk-and-deploys-cloudformation-does-this-restrict-the-infrastructure-as-code-iac-tools-that-i-can-use)
  - [1.15. How can I leverage Accelerator deployed objects in my IaC? Do I need to manually determine the arn's and object id's of Accelerator deployed objects to leverage them in my IaC?](#115-how-can-i-leverage-accelerator-deployed-objects-in-my-iac-do-i-need-to-manually-determine-the-arns-and-object-ids-of-accelerator-deployed-objects-to-leverage-them-in-my-iac)
  - [1.16. What happens if AWS stops enhancing the Accelerator?](#116-what-happens-if-aws-stops-enhancing-the-accelerator)

## 1.1. How do I add new AWS accounts to my AWS Organization?

- We offer two options and both can be used in the same deployment:

  - In both the ALZ and standalone versions of the Accelerator, you can simply add the following five lines to the configuration file `workload-account-configs` section and rerun the state machine. The majority of the account configuration will be picked up from the ou the AWS account has been assigned. You can also add additional account specific configuration, or override items like the default ou budget with an account specific budget. This mechanism is often used by customers that wish to programmatically create AWS accounts using the Accelerator and allows for adding many new accounts at one time.

  ```
  "fun-acct": {
    "account-name": "TheFunAccount",
    "email": "myemail+pbmmT-funacct@example.com",
    "src-filename": "config.json",
    "ou": "Sandbox"
  }
  ```

  - STANDALONE VERSION ONLY: We've heard consistent feedback that our customers wish to use native AWS services and do not want to do things differently once security controls, guardrails, or accelerators are applied to their environment. In this regard, simply create your new AWS account in AWS Organizations as you did before\*\*.

    - \*\* **IMPORTANT:** When creating the new AWS account using AWS Organizations, you need to specify the role name provided in the Accelerator configuration file `global-options\organization-admin-role`, **_the ONLY supported value is `AWSCloudFormationStackSetExecutionRole`_**, otherwise we cannot bootstrap the account.
    - On account creation we will apply a quarantine SCP which prevents the account from being used by anyone until the Accelerator has applied the appropriate guardrails
    - Moving the account into the appropriate OU triggers the state machine and the application of the guardrails to the account, once complete, we will remove the quarantine SCP

## 1.2. Can I use AWS Organizations for all tasks I currently use AWS Organizations for? (Standalone Version Only)

- In AWS Organizations you can continue to:
  - create and rename AWS accounts
  - move AWS accounts between ou's
  - create, delete and rename ou's, including support for nested ou's
  - create, rename, modify, apply and remove SCP's
- What can't I do:
  - modify Accelerator controlled SCP's
  - add/remove SCP's on top-level OU's (these are Accelerator controlled)
    - users can change SCP's on non-top-level ou's and accounts as they please
  - move an AWS account between top-level ou's (i.e. `Sandbox` to `Prod` is a security violation)
    - moving between `Prod/sub-ou-1` to `Prod/sub-ou2` or `Prod/sub-ou2/sub-ou2a/sub-ou2ab` is fully supported
  - create a top-level ou (need to validate, as they require config file entries)
  - remove quarantine SCP from newly created accounts
  - we do not support forward slashes (`/`) in ou names, even though the AWS platform does
- More details:
  - If you edit an Accelerator controlled SCP through Organizations, we will reset it per what is defined in the Accelerator configuration files.
  - If you add/remove an SCP from a top-level ou, we will put them back as defined in the Accelerator configuration file.
  - If you move an account between top-level ou's, we will put it back to its original designated top-level ou.
  - The Accelerator fully supports nested ou's, customers can create any depth ou structure in AWS Organizations and add/remove/change SCP's _below_ the top-level as they desire or move accounts between these ou's without restriction. Users can create ou's to the full AWS ou structure/depth.
  - Except for the Quarantine SCP applied to specific accounts, we do not 'control' SCP's below the top level, customers can add/create/customize SCP's

## 1.3. How do I import an existing AWS account into my Accelerator managed AWS Organization (or what if I created a new AWS account with a different Organization trust role)?

- Ensure you have valid administrative privileges for the account to be invited/added
- Add the account to your AWS Organization using standard processes (i.e. Invite/Accept)
  - this process does NOT create an organization trust role
  - imported accounts do NOT have the quarantine SCP applied as we don't want to break existing workloads
- Login to the account using the existing administrative credentials
- Execute the Accelerator provided CloudFormation template to create the required Accelerator bootstrapping role - in the Github repo here: `reference-artifacts\Custom-Scripts\Import-Account-CFN-Role-Template.yml`
  - add the account to the Accelerator config file and run the state machine
- If you simply created the account with an incorrect role name, you likely need to take extra steps:
  - Update the Accelerator config file to add the parameter: `global-options\ignored-ous` = `["UnManagedAccounts"]`
  - In AWS Organizations, create a new OU named `UnManagedAccounts` (case sensitive)
  - Move the account to the `UnManagedAccounts` ou
  - You can now remove the Quarantine SCP from the account
  - Assume an administrative role into the account
  - Execute the Accelerator provided CloudFormation template to create the required Accelerator bootstrapping role

## 1.4. How do I modify and extend the Accelerator or execute my own code after the Accelerator provisions a new AWS account or the state machine executes?

Flexibility:

- The AWS Secure Environment Accelerator was developed to enable extreme flexibility without requiring a single line of code to be changed. One of our primary goals throughout the development process was to avoid making any decisions that would result in users needing to fork or branch the Accelerator codebase. This would help ensure we had a sustainable and upgradable solution for a broad customer base over time.
- Functionality provided by the Accelerator can generally be controlled by modifying the main Accelerator configuration file.
- Items like SCP's, rsyslog config, Powershell scripts, and iam-policies have config files provided and auto-deployed as part of the Accelerator to deliver on the prescriptive architecture (these are located in the \reference-artifacts folder of the Github repo for reference). If you want to alter the functionality delivered by any of these additional config files, you can simply provide your own by placing it in your specified Accelerator bucket in the appropriate sub-folder. The Accelerator will use your provided version instead of the supplied repo reference version.
- As SCP's and IAM policies are defined in the main config file, you can simply define new policies, pointing to new policy files, and provide these new files in your bucket, and they will be used.
- While a sample firewall config file is provided in the \reference-artifacts folder, it must be manually placed in your s3 bucket/folder on new Accelerator deployments
- Any/all of these files can be updated at any time and will be used on the next execution of the state machine
- Over time, we predict we will provide several sample or reference architectures and not just the current single PBMM architecture (all located in the \reference-artifacts folder).

Extensibility:

- Every execution of the state machine sends a state machine status event to a state machine SNS topic
- These status events include the Success/Failure status of the state machine, and on success, a list of all successfully processed AWS accounts
- While this SNS topic is automatically subscribed to a user provided email address for user notification, users can also create additional SNS subscriptions to enable triggering their own subsequent workflows, state machines, or custom code using any supported SNS subscription type (Lambda, SQS, Email, HTTPS, HTTPS)

Example:

- One of our early adopter customers has developed a custom user interface which allows their clients to request new AWS environments. Clients provide items like cost center, budget, and select their environment requirements (i.e. Sandbox, Unclass or full PBMM SDLC account set). On appropriate approval, this pushes the changes to the Accelerator configuration file and triggers the state machine.
- Once the state machine completes, the SNS topic triggers their follow-up workflow, validates the requested accounts were provisioned, updates the customer's account database, and then executes a collection of customer specific follow-up workflow actions on any newly provisioned accounts.

## 1.5. What if my State Machine fails? Why? Previous solutions had complex recovery processes, what's involved?

If your main state machine fails, review the error(s), resolve the problem and simply re-run the state machine. We've put a huge focus on ensuring the solution is idempotent and to ensure recovery is a smooth and easy process.

Ensuring the integrity of deployed guardrails is critical in operating and maintaining an environment hosting protected data. Based on customer feedback and security best practices, we purposely fail the state machine if we cannot successfully deploy guardrails.

Additionally, with millions of active customers each supporting different and diverse use cases and with the rapid rate of evolution of the AWS platform, sometimes we will encounter unexpected circumstances and the state machine might fail.

We've spent a lot of time over the course of the Accelerator development process ensuring the solution can roll forward, roll backward, be stopped, restarted, and rerun without issues. A huge focus was placed on dealing with and writing custom code to manage and deal with non-idempotent resources (like S3 buckets, log groups, KMS keys, etc.). We've spent a lot of time ensuring that any failed artifacts are automatically cleaned up and don't cause subsequent executions to fail. We've put a strong focus on ensuring you do not need to go into your various AWS sub-accounts and manually remove or cleanup resources or deployment failures. We've also tried to provide usable error messages that are easy to understand and troubleshoot. As new scenario's are brought to our attention, we continue to adjust the codebase to better handle these situations.

Will your state machine fail at some point in time, likely. Will you be able to easily recover and move forward without extensive time and effort, YES!

## 1.6. How do I make changes to items I defined in the Accelerator configuration file during installation?

Simply update your configuration file in CodeCommit and rerun the state machine! In most cases, it is that simple.

If you ask the Accelerator to do something that is not supported by the AWS platform, the state machine will fail, so it needs to be a supported capability. For example, the platform does not allow you to change the CIDR block on a VPC, but you can accomplish this as you would today by using the Accelerator to deploy a new second VPC, manually migrating workloads, and then removing the deprecated VPC from the Accelerator configuration.

Below we have also documented additional considerations when creating or updating the configuration file.

It should be noted that we have added code to the Accelerator to block customers from making many 'breaking' or impactful changes to their configuration files. If someone is positive they want to make these changes, we also provide override switches to allow these changes to be attempted forcefully.

## 1.7. Is there anything my end users need to be aware of?

CloudWatch Log group deletion is prevented for security purposes. Users of the Accelerator environment will need to ensure they set CFN stack Log group retention type to RETAIN, or stack deletes will fail when attempting to delete a stack and your users will complain.

## 1.8. Can I upgrade directly to the latest release, or must I perform upgrades sequentially?

Yes, currently customers can upgrade from whatever version they have deployed to the latest Accelerator version. There is no requirement to perform sequential upgrades. In fact, we strongly discourage sequential upgrades.

## 1.9. Can I update the config file while the State Machine is running? When will those changes be applied?

Yes. The state machine captures a consistent input state of the requested configuration when it starts. The running Accelerator instance does not see or consider any configuration changes that occur after it has started. All configuration changes occurring after the state machine is running will only be leveraged on the _next_ state machine execution.

## 1.10. How do I update some of the supplied sample configuration items found in reference-artifact, like SCPs and IAM policies?

To override items like SCP's or IAM policies, customers simply need to provide the identically named file in there input bucket. As long as the file exists in the correct folder in the customers input bucket, the Accelerator will use the customers supplied version of the configuration item, rather than the Accelerator version. Customer SCP's need to be placed into a folder named `scp` and iam policies in a folder named `iam-policy` (case sensitive).

The Accelerator was designed to allow customers complete customization capabilities without any requirement to update code or fork the GitHub repo. Additionally, rather than forcing customers to provide a multitude of config files for a standard or prescriptive installation, we provide and auto-deploy with Accelerator versions of most required configuration items from the reference-artifacts folder of the repo. If a customer provides the required configuration file in their Accelerator S3 input bucket, we will use the customer supplied version of the configuration file rather than the Accelerator version. At any time, either before initial installation, or in future, a customer can place new or updated SCPs, policies, or other supported file types into their input bucket and we will use those instead of or in addition to Accelerator supplied versions. If a customer wishes to revert to the sample configuration, simply removing the specific files from their S3 bucket and rerunning the accelerator will revert to the repo version of the removed files. Customer only need to provide the specific files they wish to override, not all files.

Customers can also define additional SCPs (or modify existing SCPs) using the name, description and filename of their choosing, and deploy them by referencing them on the appropriate organizational unit in the config file.

NOTE: Most of the provided SCPs are designed to protect the Accelerator deployed resources from modification and ensure the integrity of the Accelerator. Extreme caution must be excercised if the provided SCPs are modified. We will be improving documenation as to which SCPs deliver security functionality versus those protecting the Accelerator itself in a future release.

## 1.11. I wish to be in compliance with the 12 TBS Guardrails, what don't you cover with the provided sample architecture?

The AWS SEA allows for a lot of flexibility in deployed architectures. If used, the provided PBMM sample architecture was designed to help deliver on the technical portion of _all_ 12 of the GC guardrails, when automation was possible.

What don't we cover? Assigning MFA to users is a manual process. Specifically you need to procure Yubikeys for your root/break glass users, and enable a suitable form of MFA for _all_ other users (i.e. virtual, email, other). The guardrails also include some organizational processes (i.e. break glass procedures, or signing an MOU with CCCS) which customers will need to work through independently.

While AWS is providing the tools to help customer be compliant with the 12 PBMM guardrails (which were developed in collaboration with the GC) - it's up to each customers ITSec organization to assess and determine if the deployed controls actually meet their security requirements.

Finally, while we started with a goal of delivering on the 12 guardrails, we believe we have extended well beyond those security controls, to further help customers move towards meeting the full PBMM technical control profile (official documentation is weak in this area at this time).

## 1.12. I deployed AWS Managed Active Directory (MAD) as part of my depoloyment, how do I manage Active Directory domain users, groups, and domain policies after deployment?

Customers have clearly indicated they do NOT want to use the Accelerator to manage their Active Directory domain or change the way they manage Active Directory on an ongoing basis. Customer have also indicated, they need help getting up and running quickly. For these reasons, the Accelerator only sets the domain password policy, and creates AD users and groups on the initial installation of MAD. After the initial installation, customers must manage Windows users and groups using their traditional tools. A bastion Windows host is deployed as a mechanism to support these capabilities. Passwords for all newly created MAD users have been stored, encrypted, in AWS Secrets Manager in the Management (root) Organization AWS account.

The Accelerator will not create/update/delete new AD users or groups, nor will it update the domain password policy after the initial installation of Managed Active Directory. It is your responsibility to rotate these passwords on a regular basis per your organizations password policy. (NOTE: After updating the admin password it needs to be stored back in secrets manager).

## 1.13. How do I suspend an AWS account?

- Prior to v1.2.4, suspending accounts were blocked via SCP:
  - a defect exists in prior releases which could cause SM failures after an account was suspended
  - required modifications to both the Part1 and Part2 SCPs
- To suspend an account, follow this process:
  - the AWS account must remain in the source OU
  - login to account to be suspended as the account root user
  - suspend the account through `My Account`
  - Run state machine, the account will:
    - have a deleted=true value added to the config file
    - be moved to the suspended OU (OU value and path stays the same in the config file)
    - deleted=true causes OU validation to be skipped on this account on subsequent SM executions
  - Deleted accounts will continue to appear under the `Suspended` OU

## 1.14. The Accelerator is written in CDK and deploys CloudFormation, does this restrict the Infrastructure as Code (IaC) tools that I can use?

No. Customers can choose the IaC framework or tooling of their choice. The tooling used to deploy the Accelerator has no impact on the automation framework customers use to deploy their applications within the Accelerator environment. It should be noted that the functionality deployed by the Accelerator is extremely platform specific and would not benefit from multi-platform IaC frameworks or tooling.

## 1.15. How can I leverage Accelerator deployed objects in my IaC? Do I need to manually determine the arn's and object id's of Accelerator deployed objects to leverage them in my IaC?

Objects deployed by the Accelerator which customers may need to leverage in their own IaC have been populated in parameters in AWS parameter store for use by the IaC tooling of choice. The Accelerator ensures parameters are deployed consistently across accounts and OUs, such that a customers code does not need to be updated when it is moved between accounts or promoted from Dev to Test to Prod.  
Objects of the following types and their associated values are stored in parameter store: vpc, subnet, security group, elb (alb/nlb w/DNS address), IAM policy, IAM role, KMS key, ACM cert, SNS topic, and the firewall replacement variables.  
Additionally, setting "populate-all-elbs-in-param-store": true for an account will populates all Accelerator wide ELB information into paramaater store within that account. The sample PBMM configuration files set this value on the perimeter account, such that ELB information is available to configure centralized ingress capabilities.

## 1.16. What happens if AWS stops enhancing the Accelerator?

- The Accelerator is an open source project, should AWS stop enhancing the solution for any reason, the community has access to the full codebase, its roadmap and history. The community can enhance, update, fork and take ownership of the project, as appropriate.
- The Accelerator is an AWS CDK based project and synthezises to native AWS CloudFormation. AWS sub-accounts simply contain native CloudFormation stacks and associated custom resources, when required. The Accelerator architecture is such that all CloudFormation stacks are native to each AWS account with no links or ties to code in other AWS accounts or even other stacks within the same AWS account. This was an important initial design decision. The Accelerator codebase can be completely uninstalled from the organization management (root) account, without any impact to the deployed functionality or guardrails. In this situation, guardrail updates and new account provisioning reverts to a manual process. Should a customer decide they no longer wish to utilize the solution, they can remove it without any impact to deployed resources and do things natively in AWS as they did before they deployed the Accelerator. By adopting the Accelerator, customers are not locking themselves or making a one-way door decision.

---

[...Return to Accelerator Table of Contents](../index.md)
