# Frequently Asked Questions

<!-- TOC depthFrom:1 depthTo:4 -->

- [1. How do I add new AWS accounts to my AWS Organization?](#1-how-do-i-add-new-aws-accounts-to-my-aws-organization)
- [2. Can I use AWS Organizations for all tasks I currently use AWS Organizations for? (Standalone Version Only)](#2-can-i-use-aws-organizations-for-all-tasks-i-currently-use-aws-organizations-for-standalone-version-only)
- [3. How do I import an existing AWS account into my Accelerator managed AWS Organization (or what if I created a new AWS account with a different Organization trust role)?](#3-how-do-i-import-an-existing-aws-account-into-my-accelerator-managed-aws-organization-or-what-if-i-created-a-new-aws-account-with-a-different-organization-trust-role)
- [4. How do I modify and extend the Accelerator or execute my own code after the Accelerator provisions a new AWS account or the state machine executes?](#4-how-do-i-modify-and-extend-the-accelerator-or-execute-my-own-code-after-the-accelerator-provisions-a-new-aws-account-or-the-state-machine-executes)
- [5. What if my State Machine fails? Why? Previous solutions had complex recovery processes, what's involved?](#5-what-if-my-state-machine-fails-why-previous-solutions-had-complex-recovery-processes-whats-involved)
- [6. How do I make changes to items I defined in the Accelerator configuration file during installation?](#6-how-do-i-make-changes-to-items-i-defined-in-the-accelerator-configuration-file-during-installation)
- [7. Is there anything my end users need to be aware of?](#7-is-there-anything-my-end-users-need-to-be-aware-of)
- [8. Can I upgrade directly to the latest release, or must I perform upgrades sequentially?](#8-can-i-upgrade-directly-to-the-latest-release-or-must-i-perform-upgrades-sequentially)
- [9. Can I update the config file while the State Machine is running? When will those changes be applied?](#9-can-i-update-the-config-file-while-the-state-machine-is-running-when-will-those-changes-be-applied)
- [10. How do I update some of the supplied sample configuration items found in reference-artifact, like SCPs and IAM policies?](#10-how-do-i-update-some-of-the-supplied-sample-configuration-items-found-in-reference-artifact-like-scps-and-iam-policies)
- [11. I wish to be in compliance with the 12 TBS Guardrails, what don't you cover with the provided sample architecture?](#11-i-wish-to-be-in-compliance-with-the-12-tbs-guardrails-what-dont-you-cover-with-the-provided-sample-architecture)
- [12. I deployed AWS Managed Active Directory (MAD) as part of my deployment, how do I manage Active Directory domain users, groups, and domain policies after deployment?](#12-i-deployed-aws-managed-active-directory-mad-as-part-of-my-deployment-how-do-i-manage-active-directory-domain-users-groups-and-domain-policies-after-deployment)
- [13. Is it possible to deploy ASEA on top of an AWS Organization that I have already installed the AWS Landing Zone (ALZ) into?](#13-is-it-possible-to-deploy-asea-on-top-of-an-aws-organization-that-i-have-already-installed-the-aws-landing-zone-alz-into)
- [14. What if I want to move an account from an AWS Organization that has ALZ deployed into it to an AWS Organization running ASEA?](#14-what-if-i-want-to-move-an-account-from-an-aws-organization-that-has-alz-deployed-into-it-to-an-aws-organization-running-asea)
- [15. What is the recommended approach to manage the ALB certificates deployed by the ASEA?](#15-what-is-the-recommended-approach-to-manage-the-alb-certificates-deployed-by-the-asea)
- [16. What level of Support will the ASEA have from AWS Support?](#16-what-level-of-support-will-the-asea-have-from-aws-support)
- [17. Why do we have rsyslog servers? I thought everything was sent to CloudWatch?](#17-why-do-we-have-rsyslog-servers-i-thought-everything-was-sent-to-cloudWatch)
- [18. Can you deploy the solution without Fortinet Firewall Licenses?](#18-can-you-deploy-the-solution-without-fortinet-firewall-licenses)
- [19. Does the ALB perform SSL offloading?](#19-does-the-alb-perform-ssl-offloading)
- [20. I need a new VPC, where shall I define it?](#20-i-need-a-new-vpc-where-shall-i-define-it)

### 1. How do I add new AWS accounts to my AWS Organization?

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

### 2. Can I use AWS Organizations for all tasks I currently use AWS Organizations for? (Standalone Version Only)

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

### 3. How do I import an existing AWS account into my Accelerator managed AWS Organization (or what if I created a new AWS account with a different Organization trust role)?

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

### 4. How do I modify and extend the Accelerator or execute my own code after the Accelerator provisions a new AWS account or the state machine executes?

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

### 5. What if my State Machine fails? Why? Previous solutions had complex recovery processes, what's involved?

If your main state machine fails, review the error(s), resolve the problem and simply re-run the state machine. We've put a huge focus on ensuring the solution is idempotent and to ensure recovery is a smooth and easy process.

Ensuring the integrity of deployed guardrails is critical in operating and maintaining an environment hosting protected data. Based on customer feedback and security best practices, we purposely fail the state machine if we cannot successfully deploy guardrails.

Additionally, with millions of active customers each supporting different and diverse use cases and with the rapid rate of evolution of the AWS platform, sometimes we will encounter unexpected circumstances and the state machine might fail.

We've spent a lot of time over the course of the Accelerator development process ensuring the solution can roll forward, roll backward, be stopped, restarted, and rerun without issues. A huge focus was placed on dealing with and writing custom code to manage and deal with non-idempotent resources (like S3 buckets, log groups, KMS keys, etc.). We've spent a lot of time ensuring that any failed artifacts are automatically cleaned up and don't cause subsequent executions to fail. We've put a strong focus on ensuring you do not need to go into your various AWS sub-accounts and manually remove or cleanup resources or deployment failures. We've also tried to provide usable error messages that are easy to understand and troubleshoot. As new scenario's are brought to our attention, we continue to adjust the codebase to better handle these situations.

Will your state machine fail at some point in time, likely. Will you be able to easily recover and move forward without extensive time and effort, YES!

### 6. How do I make changes to items I defined in the Accelerator configuration file during installation?

Simply update your configuration file in CodeCommit and rerun the state machine! In most cases, it is that simple.

If you ask the Accelerator to do something that is not supported by the AWS platform, the state machine will fail, so it needs to be a supported capability. For example, the platform does not allow you to change the CIDR block on a VPC, but you can accomplish this as you would today by using the Accelerator to deploy a new second VPC, manually migrating workloads, and then removing the deprecated VPC from the Accelerator configuration.

Below we have also documented additional considerations when creating or updating the configuration file.

It should be noted that we have added code to the Accelerator to block customers from making many 'breaking' or impactful changes to their configuration files. If someone is positive they want to make these changes, we also provide override switches to allow these changes to be attempted forcefully.

### 7. Is there anything my end users need to be aware of?

CloudWatch Log group deletion is prevented for security purposes. Users of the Accelerator environment will need to ensure they set CFN stack Log group retention type to RETAIN, or stack deletes will fail when attempting to delete a stack and your users will complain.

### 8. Can I upgrade directly to the latest release, or must I perform upgrades sequentially?

Yes, currently customers can upgrade from whatever version they have deployed to the latest Accelerator version. There is no requirement to perform sequential upgrades. In fact, we strongly discourage sequential upgrades.

### 9. Can I update the config file while the State Machine is running? When will those changes be applied?

Yes. The state machine captures a consistent input state of the requested configuration when it starts. The running Accelerator instance does not see or consider any configuration changes that occur after it has started. All configuration changes occurring after the state machine is running will only be leveraged on the _next_ state machine execution.

### 10. How do I update some of the supplied sample configuration items found in reference-artifact, like SCPs and IAM policies?

To override items like SCP's or IAM policies, customers simply need to provide the identically named file in there input bucket. As long as the file exists in the correct folder in the customers input bucket, the Accelerator will use the customers supplied version of the configuration item, rather than the Accelerator version. Customer SCP's need to be placed into a folder named `scp` and iam policies in a folder named `iam-policy` (case sensitive).

The Accelerator was designed to allow customers complete customization capabilities without any requirement to update code or fork the GitHub repo. Additionally, rather than forcing customers to provide a multitude of config files for a standard or prescriptive installation, we provide and auto-deploy with Accelerator versions of most required configuration items from the reference-artifacts folder of the repo. If a customer provides the required configuration file in their Accelerator S3 input bucket, we will use the customer supplied version of the configuration file rather than the Accelerator version. At any time, either before initial installation, or in future, a customer can place new or updated SCPs, policies, or other supported file types into their input bucket and we will use those instead of or in addition to Accelerator supplied versions. If a customer wishes to revert to the sample configuration, simply removing the specific files from their S3 bucket and rerunning the accelerator will revert to the repo version of the removed files. Customer only need to provide the specific files they wish to override, not all files.

Customers can also define additional SCPs (or modify existing SCPs) using the name, description and filename of their choosing, and deploy them by referencing them on the appropriate organizational unit in the config file.

NOTE: Most of the provided SCPs are designed to protect the Accelerator deployed resources from modification and ensure the integrity of the Accelerator. Extreme caution must be excercised if the provided SCPs are modified. We will be improving documenation as to which SCPs deliver security functionality versus those protecting the Accelerator itself in a future release.

### 11. I wish to be in compliance with the 12 TBS Guardrails, what don't you cover with the provided sample architecture?

The AWS SEA allows for a lot of flexibility in deployed architectures. If used, the provided PBMM sample architecture was designed to help deliver on the technical portion of _all_ 12 of the GC guardrails, when automation was possible.

What don't we cover? Assigning MFA to users is a manual process. Specifically you need to procure Yubikeys for your root/break glass users, and enable a suitable form of MFA for _all_ other users (i.e. virtual, email, other). The guardrails also include some organizational processes (i.e. break glass procedures, or signing an MOU with CCCS) which customers will need to work through independently.

While AWS is providing the tools to help customer be compliant with the 12 PBMM guardrails (which were developed in collaboration with the GC) - it's up to each customers ITSec organization to assess and determine if the deployed controls actually meet their security requirements.

Finally, while we started with a goal of delivering on the 12 guardrails, we believe we have extended well beyond those security controls, to further help customers move towards meeting the full PBMM technical control profile (official documentation is weak in this area at this time).

### 12. I deployed AWS Managed Active Directory (MAD) as part of my deployment, how do I manage Active Directory domain users, groups, and domain policies after deployment?

Customers have clearly indicated they do NOT want to use the Accelerator to manage their Active Directory domain or change the way they manage Active Directory on an ongoing basis. Customer have also indicated, they need help getting up and running quickly. For these reasons, the Accelerator only sets the domain password policy, and creates AD users and groups on the initial installation of MAD. After the initial installation, customers must manage Windows users and groups using their traditional tools. A bastion Windows host is deployed as a mechanism to support these capabilities. Passwords for all newly created MAD users have been stored, encrypted, in AWS Secrets Manager in the Management (root) Organization AWS account.

The Accelerator will not create/update/delete new AD users or groups, nor will it update the domain password policy after the initial installation of Managed Active Directory. It is your responsibility to rotate these passwords on a regular basis per your organizations password policy. (NOTE: After updating the admin password it needs to be stored back in secrets manager).

### 13. Is it possible to deploy ASEA on top of an AWS Organization that I have already installed the AWS Landing Zone (ALZ) into?

Existing ALZ customers are required to remove their ALZ deployment before deploying the ASEA. Procedures are available to assist with this process. Please work with your AWS account team to find the best mechanism to uninstall the ALZ solution.

### 14. What if I want to move an account from an AWS Organization that has ALZ deployed into it to an AWS Organization running ASEA?

We recommend terminating the AWS Service Catalog product associated with the member account that you're interested in moving. Ensure that the product terminates successfully and that there aren't any remaining CloudFormation stacks in the account that were deployed by the ALZ. Then, you can make the account standalone (to leave its existing organization) and invite it to the new organization.

### 15. What is the recommended approach to manage the ALB certificates deployed by the ASEA?

While the initial deployment allows you to provide your own certificates (either self-signed or generated by a CA), we recommend leveraging AWS Certificate Manager (ACM) to easily provision, manage, and deploy public and private SSL/TLS certificates for use with your ALBs. ACM helps manage the challenges of maintaining certificates, including certificate renewals so you don’t have to worry about expiring certificates. 

To update the ALB cert, configure ACM for the required domain including adding the appropriate entries to DNS to authorize the automated provisioning of certificates. Update the config file by adding the certificate request in the format below:

```json
"certificates": [
  {
    "name": "PublicCert",
    "type": "request",
    "domain": "*.example.com",
    "validation": "DNS",
    "san": ["*.example1.com"]
  }
]
```
Also, update the config file so that your ALB's “cert-name” or “cert-arn” uses the new certificate in the format below:
```json
"alb": [
  {
    "cert-name": "PublicCert",
  }
]
```

or

```json
"alb": [
  {
    "cert-arn": "arn:aws:acm:ca-central-1:[account-id]:certificate/[identifier]",
  }
]
```

### 16. What level of Support will the ASEA have from AWS Support?

The majority of the solution includes native AWS services, and are covered by AWS support which can be accessed by opening a Support Case. Note that the ASEA does not rely on CloudFormation StackSets and utilizes the CDK's ability to synthesize stacks which are deployed directly into your organization's member accounts, reducing complexities associated with troubleshooting cross-account deployments. 

As the ASEA also includes code, anything specifically related to the code would be "best effort"; the first line of support is typically your local AWS team (your SA, TAM, Proserve and/or AWS Partner). Issues can be filed against the GitHub repository, with most issues associated to installation.

### 17. Why do we have rsyslog servers? I thought everything was sent to CloudWatch?

The rsyslog servers will accept logs for appliances and third party applications that do not natively support the CloudWwatch Agent. For example, the Fortigate firewalls will send their logs to rsyslog which will in turn store them to CloudWatch. Note that logs are only persisted on the rsyslog hosts for 24 hours.

### 18. Can you deploy the solution without Fortinet Firewall Licenses?

Yes, the firewalls will come up and route traffic, but you have no mechanism to manage the firewalls/change the configuration. If this is a test deployment, please work directly with your local Fortinet account team to discuss any options for temporary evaluation (eval) licenses.

You can install and deploy the Fortinet firewalls without eval licenses, the firewalls will come up and route traffic, but you have NO mechanism to manage the firewalls or change the config until youprovide the eval licenses.

If this is a test deployment, please work directly with your local Fortinet account team to discuss any options for eval licenses.

### 19. Does the ALB perform SSL offloading?

As configured - the perimeter ALB decrypts the traffic and then re-encrypts it with the cert for the back-end ALB.  They can be the same or different certs.  If the Firewall needs to inspect the traffic, it also needs the backend cert manually installed.

### 20. I need a new VPC, where shall I define it?

You can define a VPC in one of three major sections of the configuration file:
a) within an organization unit (this is the recommended method)
b) within an account in mandatory-account-configs -> the account 
c) within workload-account-configs

---

[...Return to Accelerator Table of Contents](../index.md)
