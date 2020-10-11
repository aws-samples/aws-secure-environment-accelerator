# 1. Installation, Upgrades and Basic Operations

**_Deploying the AWS Accelerator requires the assistance of your local AWS Account team. Attempts to deploy the Accelerator without the support of your AWS SA, TAM, Proserve, or AM will fail as new AWS accounts do not have appropriate limits established to facilitate installation._**

Installation of the provided prescriptive AWS architecture, as-is, requires a limit increase to support a minimum of 6 AWS accounts in the AWS Organization plus any additional required workload accounts.

_Users are strongly encouraged to also read the Accelerator Operations/Troubleshooting Guide before installation. The Operations/Troubleshooting Guide provides details as to what is being performed at each stage of the installation process, including detailed troubleshooting guidance._

These installation instructions assume the prescribed architecture is being deployed.

- [1. Installation, Upgrades and Basic Operations](#1-installation-upgrades-and-basic-operations)
  - [1.1. Prerequisites](#11-prerequisites)
    - [1.1.1. General](#111-general)
    - [1.1.2. Accelerator Pre-Install Steps](#112-accelerator-pre-install-steps)
    - [1.1.3. AWS Internal Accounts Only](#113-aws-internal-accounts-only)
  - [1.2. Preparation](#12-preparation)
    - [1.2.1. Create GitHub Personal Access Token and Store in Secrets Manager](#121-create-github-personal-access-token-and-store-in-secrets-manager)
    - [1.2.2. Basic Accelerator Configuration](#122-basic-accelerator-configuration)
    - [1.2.3. Production Accelerator Configuration](#123-production-accelerator-configuration)
  - [1.3. Installation](#13-installation)
    - [1.3.1. Known Installation Issues](#131-known-installation-issues)
- [2. Accelerator Basic Operation](#2-accelerator-basic-operation)
    - [2.0.1. How do I add new AWS accounts to my AWS Organization?](#201-how-do-i-add-new-aws-accounts-to-my-aws-organization)
    - [2.0.2. Can I use AWS Organizations for all tasks I currently use AWS Organizations for? (Standalone Version Only)](#202-can-i-use-aws-organizations-for-all-tasks-i-currently-use-aws-organizations-for-standalone-version-only)
    - [2.0.3. How do I import an existing AWS account into my Accelerator managed AWS Organization (or what if I created a new AWS account with a different Organization trust role)?](#203-how-do-i-import-an-existing-aws-account-into-my-accelerator-managed-aws-organization-or-what-if-i-created-a-new-aws-account-with-a-different-organization-trust-role)
    - [2.0.4. How do I modify and extend the Accelerator or execute my own code after the Accelerator provisions a new AWS account or the state machine executes?](#204-how-do-i-modify-and-extend-the-accelerator-or-execute-my-own-code-after-the-accelerator-provisions-a-new-aws-account-or-the-state-machine-executes)
    - [2.0.5. What if my State Machine fails? Why? Previous solutions had complex recovery processes, what's involved?](#205-what-if-my-state-machine-fails-why-previous-solutions-had-complex-recovery-processes-whats-involved)
    - [2.0.6. How do I make changes to items I defined in the Accelerator configuration file during installation?](#206-how-do-i-make-changes-to-items-i-defined-in-the-accelerator-configuration-file-during-installation)
    - [2.0.7. Is there anything my end users need to be aware of?](#207-is-there-anything-my-end-users-need-to-be-aware-of)
    - [2.0.8. Can I upgrade directly to the latest release, or must I perform upgrades sequentially?](#208-can-i-upgrade-directly-to-the-latest-release-or-must-i-perform-upgrades-sequentially)
    - [2.0.9. Can I update the config file while the State Machine is running? When will those changes be applied?](#209-can-i-update-the-config-file-while-the-state-machine-is-running-when-will-those-changes-be-applied)
    - [2.0.10. How do I update some of the supplied sample configuration items found in reference-artifact, like SCPs and IAM policies?](#2010-how-do-i-update-some-of-the-supplied-sample-configuration-items-found-in-reference-artifact-like-scps-and-iam-policies)
    - [2.0.11. I wish to be in compliance with the 12 TBS Guardrails, what don't you cover with the provided sample architecture?](#2011-i-wish-to-be-in-compliance-with-the-12-tbs-guardrails-what-dont-you-cover-with-the-provided-sample-architecture)
- [3. Notes](#3-notes)
  - [3.1. Upgrades](#31-upgrades)
    - [3.1.1. Summary of Upgrade Steps (all versions)](#311-summary-of-upgrade-steps-all-versions)
  - [3.2. Configuration File Hints and Tips](#32-configuration-file-hints-and-tips)
  - [3.3. Considerations: Importing existing AWS Accounts / Deploying Into Existing AWS Organizations](#33-considerations-importing-existing-aws-accounts--deploying-into-existing-aws-organizations)
    - [3.3.1. Process to import existing AWS accounts into an Accelerator managed Organization](#331-process-to-import-existing-aws-accounts-into-an-accelerator-managed-organization)
    - [3.3.2. Deploying the Accelerator into an existing Organization](#332-deploying-the-accelerator-into-an-existing-organization)
  - [3.4. Design Constraints](#34-design-constraints)
- [4. AWS Internal - Accelerator Release Process](#4-aws-internal---accelerator-release-process)
  - [4.1. Creating a new Accelerator Code Release](#41-creating-a-new-accelerator-code-release)

## 1.1. Prerequisites

### 1.1.1. General

- Root AWS Organization account (the AWS Accelerator cannot be deployed in an AWS sub-account)
  - No additional AWS accounts need to be pre-created before Accelerator installation
- Limit increase to support a minimum of 6 new sub-accounts plus any additional workload accounts
- Valid configuration file, updated to reflect your deployment (see below)
- Determine your primary or Accelerator 'control' region. These instructions have been written assuming ca-central-1, but any supported region can be substituted.
- The Accelerator _can_ be installed into existing AWS Organizations - see caveats and notes
- Existing ALZ customers are required to remove their ALZ deployment before deploying the Accelerator. Scripts are available to assist with this process. Due to long-term supportability concerns, we no longer support installing the Accelerator on top of the ALZ.

### 1.1.2. Accelerator Pre-Install Steps

Before installing, you must first:

1. Login to the organization **root AWS account** with `AdministratorAccess`.
2. **_Set the region to `ca-central-1`._**
3. Enable AWS Organizations
4. Enable Service Control Policies
5. In AWS Organizations, ["Verify"](https://aws.amazon.com/blogs/security/aws-organizations-now-requires-email-address-verification/) the root account email address (this is a technical process)
6. Ensure `alz-baseline=false` is set in the configuration file
7. Create a new KMS key to encrypt your source configuration bucket (you can use an existing key)

- AWS Key Management Service, Customer Managed Keys, Create Key, Symmetric, and then provide a key name
  (`PBMMAccel-Source-Bucket-Key`), Next
- Select a key administrator (Admin Role or Group for the root account), Next
- Select key users (Admin Role or Group for the root account), Next
- Validate an entry exists to "Enable IAM User Permissions" (critical step if using an existing key)
  - `"arn:aws:iam::123456789012:root"`, where `123456789012` is your **_root_** account id.
- Click Finish

8. Enable `"Cost Explorer"` (My Account, Cost Explorer, Enable Cost Explorer)
9. Enable `"Receive Billing Alerts"` (My Account, Billing Preferences, Receive Billing Alerts)
10. It is **_extremely important_** that **_all_** the account contact details be validated in the ROOT account before deploying any new sub-accounts.

- This information is copied to every new sub-account on creation.
- Subsequent changes to this information require manually updating it in **\*each** sub-account.
- Go to `My Account` and verify/update the information lists under both the `Contact Information` section and the `Alternate Contacts` section.
- Please ESPECIALLY make sure the email addresses and Phone numbers are valid and regularly monitored. If we need to reach you due to suspicious account activity, billing issues, or other urgent problems with your account - this is the information that is used. It is CRITICAL it is kept accurate and up to date at all times.

### 1.1.3. AWS Internal Accounts Only

If deploying to an internal AWS account, to successfully install the entire solution, you need to enable Private Marketplace (PMP) before starting:

1. In the root account go here: https://aws.amazon.com/marketplace/privatemarketplace/create
2. Click Create Marketplace
3. Go to Profile sub-tab, click the `Not Live` slider to make it `Live`
4. Click the `Software requests` slider to turn `Requests off`
5. Change the name field (i.e. append `-PMP`) and change the color, so it is clear PMP is enabled for users
6. Search Private Marketplace for Fortinet products
7. Unselect the `Approved Products` filter and then select:
   - `Fortinet FortiGate (BYOL) Next-Generation Firewall`
8. Select "Add to Private Marketplace" in the top right
   - Due to PMP provisioning delays, this sometimes fails when attempted immediately following enablement of PMP - retry after 20 minutes.
9. Wait a couple of minutes while it adds item to your PMP - do NOT subscribe or accept the EULA
   - Repeat for `Fortinet FortiManager (BYOL) Centralized Security Management`

## 1.2. Preparation

### 1.2.1. Create GitHub Personal Access Token and Store in Secrets Manager

1. You require a GitHub access token to access the code repository
2. Instructions on how to create a personal access token are located [here](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token).
3. Select the scope `repo: Full control over private repositories`.
4. Store the personal access token in Secrets Manager as plain text. Name the secret `accelerator/github-token` (case sensitive).
   - Via AWS console
     - Store a new secret, and select `Other type of secrets`, `Plaintext`
     - Paste your secret with no formatting no leading or trailing spaces
     - Select either the key you created above (`PBMMAccel-Source-Bucket-Key`),
     - Set the secret name to `accelerator/github-token` (case sensitive)
     - Select `Disable rotation`

### 1.2.2. Basic Accelerator Configuration

1. You can use the [`config.example.json`](../../reference-artifacts/config.example.json) or [`config.lite-example.json`](../../reference-artifacts/config.lite-example.json) files as base
   - Use the version from the Github code branch you are deploying from as some parameters have changed over time
   - On upgrades, compare your deployed configuration file with the latest branch configuration file for any new or changed parameters
   - These configuration files can be used, as-is, with only minor modification to successfully deploy the standard architecture
   - These files are described in more detail [here](./customization-index.md)
2. At minimum, you MUST update the AWS account names and email addresses in the sample file:

   1. For existing accounts, they must match identically to the account names and email addresses defined in AWS Organizations;
   2. For new accounts, they must reflect the new account name/email you want created;
   3. All new AWS accounts require a unique email address which has never before been used to create an AWS account;
   4. When updating the budget notification email addresses within the example, a single email address for all is sufficient;
   5. For a test deployment, the remainder of the values can be used as-is.

3. A successful deployment requires VPC access to 6 AWS endpoints, you cannot remove both the perimeter firewalls (all public endpoints) and the 6 required central VPC endpoints from the config file (ec2, ec2messages, ssm, ssmmessages, cloudformation, secretsmanager).

- If you update the firewall names, be sure to update the routes and alb's which point to them. Firewall licensing occurs through the mgmt port, which requires a VPC route back to the firewall to get internet access and validate the firewall license.

### 1.2.3. Production Accelerator Configuration

- **For a production deployment, THIS REQUIRES EXTENSIVE PREPARATION AND PLANNING**
  - Plan your OU structure, we are suggesting:
    - core, Central, Sandbox, Unclass, Dev, Test, Prod
    - These OUs correspond with major permission shifts in the SDLC cycle and NOT every stage an organization has in their SDLC cycle (i.e. QA or pre-prod would be included in one of the other OUs)
    - While OUs can be renamed or additional OUs added at a later point in time, deployed AWS accounts CANNOT be moved between top-level OUs (guardrail violation), nor can OUs easily be deleted (requires deleting all AWS accounts from within the OU first).
  - 6 \* RFC1918 Class B address blocks (CIDR's) which do not conflict with your on-premise networks
    - VPC CIDR blocks cannot be changed after installation, this is simply the way the AWS platform works, given everything is built on top of them. Carefully consider your address block selection.
    - one block for each OU, except Sandbox which is not routable
    - the "core" Class B range will be split to support the Endpoint VPC and Perimeter VPC
  - 2 \* RFC6598 /23 address blocks (Government of Canada (GC) requirement only)
    - Used for MAD deployment and perimeter underlay network
    - non-GC customers can drop the extra MAD subnets in the Central VPC and use address space from the core CIDR range for the perimeter VPC
  - 2 \* BGP ASN's (TGW, FW Cluster)(a third is required if you are deploying a VGW for DX connectivity)
  - A Unique Windows domain name (`deptaws`/`dept.aws`, `deptcloud`/`dept.cloud`, etc.)
    - Given this is designed as the primary identity store and used to domain join all cloud hosted workloads, changing this in future is difficult
    - Pick a Windows domain name that does NOT conflict with your on-premise AD domains, ensuring the naming convention conforms to your organizations domain naming standards to ensure you can eventually create a domain trust between the MAD and on-premise domains/forests
  - DNS Domain names and DNS server IP's for on-premise private DNS zones requiring cloud resolution (can be added in future)
  - DNS Domain for a cloud hosted public zone `"public": ["dept.cloud-nuage.canada.ca"]` (can be added in future)
  - DNS Domain for a cloud hosted private zone `"private": ["dept.cloud-nuage.gc.ca"]` (can be added in future)
  - Wildcard TLS certificate for each of the 2 previous zones (can be added in future)
  - 2 Fortinet FortiGate firewall licenses (Evaluation licenses adequate) (can be added in future)
  - We also recommend at least 20 unique email ALIASES associated with a single mailbox, never used before to open AWS accounts, such that you do not need to request new email aliases every time you need to create a new AWS account.

4. Create an S3 bucket in your root account with versioning enabled `your-bucket-name`
   - you must supply this bucket name in the CFN parameters _and_ in the config file
   - the bucket name _must_ be the same in both spots
   - the bucket should be `S3-KMS` encrypted using the `PBMMAccel-Source-Bucket-Key` created above
5. Place your customized config file, named `config.json` (or `config.yaml`), in your new bucket
6. Place the firewall configuration and license files in the folder and path defined in the config file
   - i.e. `firewall/firewall-example.txt`, `firewall/license1.lic` and `firewall/license2.lic`
   - Sample available here: `./reference-artifacts/Third-Party/firewall-example.txt`
   - If you don't have any license files, update the config file with an empty array (`"license": []`). Do NOT use the following: `[""]`.
7. Place any defined certificate files in the folder and path defined in the config file
   - i.e. `certs/example1-cert.key`, `certs/example1-cert.crt`
   - Sample available here: `./reference-artifacts/Certs-Sample/*`
   - Ideally you would generate real certificates using your existing certificate authority
   - Should you wish, instructions are provided to aid in generating your own self-signed certificates (Self signed certificates are NOT secure and simply for demo purposes)
   - Use the examples to demonstrate Accelerator TLS functionality only
8. Detach **_ALL_** SCPs (except `FullAWSAccess` which remains in place) from all OU's and accounts before proceeding
   - Installation **will fail** if this step is skipped

## 1.3. Installation

1. You can find the latest release in the repository [here](https://github.com/aws-samples/aws-secure-environment-accelerator/releases).
2. Download the CloudFormation template `AcceleratorInstallerXXX.template.json` for the release you plan to install
3. Use the provided CloudFormation template to deploy a new stack in your AWS account
4. **_Make sure you are in `ca-central-1` (or your desired primary or control region)_**
5. Fill out the required parameters - **_LEAVE THE DEFAULTS UNLESS SPECIFIED BELOW_**
6. Specify `Stack Name` STARTING with `PBMMAccel-` (case sensitive) suggest a suffix of `deptname` or `username`
7. Change `ConfigS3Bucket` to the name of the bucket you created above `your-bucket-name`
8. Add an `Email` address to be used for State Machine Status notification
9. The `GithubBranch` should point to the release you selected
   - if upgrading, change it to point to the desired release
   - the latest stable branch is currently `release/v1.2.0`, case sensitive
10. Apply a tag on the stack, Key=`Accelerator`, Value=`PBMM` (case sensitive).
11. **ENABLE STACK TERMINATION PROTECTION** under `Stack creation options`
12. The stack typically takes under 5 minutes to deploy.
13. Once deployed, you should see a CodePipeline project named `PBMMAccel-InstallerPipeline` in your account. This pipeline connects to Github, pulls the code from the prescribed branch and deploys the Accelerator state machine.
14. For new stack deployments, when the stack deployment completes, the Accelerator state machine will automatically execute (in Code Pipeline). When upgrading you must manually `Release Change` to start the pipeline.
15. **While the pipeline is running, review the list of [Known Installation Issues]([https://github.com/aws-samples/aws-secure-environment-accelerator/blob/master/docs/installation/index.md#Known-Installation-Issues) near the bottom on this document**
16. Once the pipeline completes (typically 15-20 minutes), the main state machine, named `PBMMAccel-MainStateMachine_sm`, will start in Step Functions
17. The state machine takes several hours to execute on an initial installation. Timing for subsequent executions depends entirely on what resources are changed in the configuration file, but can take as little as 20 minutes.
18. The configuration file will be automatically moved into Code Commit (and deleted from S3). From this point forward, you must update your configuration file in CodeCommit.
19. You will receive an email from the State Machine SNS topic. Please confirm the email subscription to enable receipt of state machine status messages. Until completed you will not receive any email messages.
20. After the perimeter account is created in AWS Organizations, but before the Accelerator reaches Stage 2:
    1. NOTE: If you miss the step, or fail to execute it in time, no need to be concerned, you will simply need to re-run the main state machine (`PBMMAccel-MainStateMachine_sm`) to deploy the firewall products
    2. Login to the **perimeter** sub-account (Assume your `organization-admin-role`)
    3. Activate the Fortinet Fortigate BYOL AMI and the Fortinet FortiManager BYOL AMI at the URL: https://aws.amazon.com/marketplace/privatemarketplace
       - Note: you should see the private marketplace, including the custom color specified in prerequisite step 4 above.
       - When complete, you should see the marketplace products as subscriptions **in the Perimeter account**:

![marketplace](img/marketplace.png)

21. Once themain state machine (`PBMMAccel-MainStateMachine_sm`) completes successfully, confirm the status of your perimeter firewall deployment.
    - While you can watch the state machine in Step Functions, you will also be notified via email when the State Machine completes (or fails). Successful state machine executions include a list of all accounts which were successfully processed by the Accelerator.
22. If your perimeter firewalls were not deployed on first run, you will need to rerun the state machine. This happens when:
    1. you were unable to activate the firewall AMI's before stage 2 (step 19)
    2. we were not able to fully activate your account before we were ready to deploy your firewalls
    3. In these cases, simply select the `PBMMAccel-MainStateMachine_sm` in Step Functions and select `Start Execution`
23. The Accelerator installation is complete, but several manual steps remain:

    1. recover root passwords for all sub-accounts
    2. enable MFA for **all** IAM users and **all** root users
    3. Login to the firewalls and firewall manager appliance and set default passwords
       - Update firewall configuration per your organizations security best practices
       - manually update firewall configuration to forward all logs to the Accelerator deployed NLB addresses fronting the rsyslog cluster
         - login to each firewall, select `Log Settings`, check `Send logs to syslog`, put the NLB FQDN in the `IP Address/FQDN` field
       - manually update the firewall configuration to connect perimeter ALB high port flows through to internal account ALB's
         - login to each firewall, switch to `FG-traffic` vdom, select `Policies & Objects`, select `Addresses`, Expand `Addresses`
         - Set `Prod1-ALB-FQDN` to point to a reliable sub-account ALB FQDN, this is used for full-path health checks on **_all_** ALB's
         - Set additional `DevX-ALB-FQDN`, `TestX-ALB-FQDN` and `ProdX-ALB-FQDN` to point to workload account ALB FQDNs
         - Two of each type of ALB FQDN records have been created, when you need more, you need to create BOTH an additional FQDN and a new VIP, per ALB
           - Each new VIP will use a new high port (i.e. 7007, 7008, etc.), all of which map back to port 443
    4. In ca-central-1, Enable AWS SSO, Set the SSO directory to MAD, set the SSO email attrib to: \${dir:email}, create all default permission sets and any desired custom permission sets, map MAD groups to perm sets
    5. On a per role basis, you need to enable the CWL Account Selector in the Security and the Ops accounts

24. During the installation we request required limit increases, resources dependent on these limits will not be deployed
    1. Limit increase requests are controlled through the Accelerator configuration file `"limits":{}` setting
    2. The sample configuration file requests increases to your EIP count in the perimeter account and to the VPC count and Interface Endpoint count in the shared-network account
    3. You should receive emails from support confirming the limit increases
    4. On the next state machine execution, resources blocked by limits should be deployed (i.e. additional VPC's and Endpoints)
    5. If more than 2 days elapses without the limits being increased, on the next state machine execution, they will be re-requested

### 1.3.1. Known Installation Issues

- Standalone Accelerator v1.1.6 and v1.1.7 may experience a state machine failure when attempting to deploy GuardDuty in at least one random region. Simply rerun the State Machine. This is resolved in v1.1.8.
- Standalone Accelerator versions prior to v1.1.8 required manual creation of the core ou and moving the root AWS account into it before running the State Machine. If this step is missed, once the SM fails, simply move the root account into the auto-created core ou and rerun the state machine. This is resolved in v1.1.8.

# 2. Accelerator Basic Operation

### 2.0.1. How do I add new AWS accounts to my AWS Organization?

- We offer two options and both can be used in the same deployment:

  - In both the ALZ and standalone versions of the Accelerator, you can simply add the following five lines to the configuration file `workload-account-configs` section and rerun the state machine. The majority of the account configuration will be picked up from the ou the AWS account has been assigned. You can also add additional account specific configuration, or override items like the default ou budget with an account specific budget. This mechanism is often used by customers that wish to programmatically create AWS accounts using the Accelerator and allows for adding many new accounts at one time.

  ```
  "fun-acct": {
    "account-name": "TheFunAccount",
    "email": "myemail+pbmmT-funacct@example.com",
    "ou": "Sandbox"
  }
  ```

  - STANDALONE VERSION ONLY: We've heard consistent feedback that our customers wish to use native AWS services and do not want to do things differently once security controls, guardrails, or accelerators are applied to their environment. In this regard, simply create your new AWS account in AWS Organizations as you did before\*\*.

    - \*\* **IMPORTANT:** When creating the new AWS account using AWS Organizations, you need to specify the role name provided in the Accelerator configuration file `global-options\organization-admin-role`, **_the ONLY supported value is `AWSCloudFormationStackSetExecutionRole`_**, otherwise we cannot bootstrap the account.
    - On account creation we will apply a quarantine SCP which prevents the account from being used by anyone until the Accelerator has applied the appropriate guardrails
    - Moving the account into the appropriate OU triggers the state machine and the application of the guardrails to the account, once complete, we will remove the quarantine SCP

### 2.0.2. Can I use AWS Organizations for all tasks I currently use AWS Organizations for? (Standalone Version Only)

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

### 2.0.3. How do I import an existing AWS account into my Accelerator managed AWS Organization (or what if I created a new AWS account with a different Organization trust role)?

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

### 2.0.4. How do I modify and extend the Accelerator or execute my own code after the Accelerator provisions a new AWS account or the state machine executes?

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

### 2.0.5. What if my State Machine fails? Why? Previous solutions had complex recovery processes, what's involved?

If your main state machine fails, review the error(s), resolve the problem and simply re-run the state machine. We've put a huge focus on ensuring the solution is idempotent and to ensure recovery is a smooth and easy process.

Ensuring the integrity of deployed guardrails is critical in operating and maintaining an environment hosting protected data. Based on customer feedback and security best practices, we purposely fail the state machine if we cannot successfully deploy guardrails.

Additionally, with millions of active customers each supporting different and diverse use cases and with the rapid rate of evolution of the AWS platform, sometimes we will encounter unexpected circumstances and the state machine might fail.

We've spent a lot of time over the course of the Accelerator development process ensuring the solution can roll forward, roll backward, be stopped, restarted, and rerun without issues. A huge focus was placed on dealing with and writing custom code to manage and deal with non-idempotent resources (like S3 buckets, log groups, KMS keys, etc). We've spent a lot of time ensuring that any failed artifacts are automatically cleaned up and don't cause subsequent executions to fail. We've put a strong focus on ensuring you do not need to go into your various AWS sub-accounts and manually remove or cleanup resources or deployment failures. We've also tried to provide usable error messages that are easy to understand and troubleshoot. As unhandled scenario's are brought to our attention, we continue to adjust the codebase to better handle these situations.

Will your state machine fail at some point in time, likely. Will you be able to easily recover and move forward without extensive time and effort, YES!

### 2.0.6. How do I make changes to items I defined in the Accelerator configuration file during installation?

Simply update your configuration file in CodeCommit and rerun the state machine! In most cases, it is that simple.

If you ask the Accelerator to do something that is not supported by the AWS platform, the state machine will fail, so it needs to be a supported capability. For example, the platform does not allow you to change the CIDR block on a VPC, but you can accomplish this as you would today by using the Accelerator to deploy a new second VPC, manually migrating workloads, and then removing the deprecated VPC from the Accelerator configuration.

Below we have also documented additional considerations when creating or updating the configuration file.

It should be noted that we have added code to the Accelerator to block customers from making many 'breaking' or impactful changes to their configuration files. If someone is positive they want to make these changes, we also provide override switches to allow these changes to be attempted forcefully.

### 2.0.7. Is there anything my end users need to be aware of?

CloudWatch Log group deletion is prevented for security purposes. Users of the Accelerator environment will need to ensure they set CFN stack Log group retention type to RETAIN, or stack deletes will fail when attempting to delete a stack and your users will complain.

### 2.0.8. Can I upgrade directly to the latest release, or must I perform upgrades sequentially?

Yes, currently customers can upgrade from whatever version they have deployed to the latest Accelerator version. There is no requirement to perform sequential upgrades. In fact, we strongly discourage sequential upgrades.

### 2.0.9. Can I update the config file while the State Machine is running? When will those changes be applied?

Yes. The state machine captures a consistent input state of the requested configuration when it starts. The running Accelerator instance does not see or consider any configuration changes that occur after it has started. All configuration changes occurring after the state machine is running will only be leveraged on the _next_ state machine execution.

### 2.0.10. How do I update some of the supplied sample configuration items found in reference-artifact, like SCPs and IAM policies?

To overide items like SCP's or IAM policies, customers simply need to provide the identically names file in there input bucket. As long as the file exists in the customers input bucket, the Accelerator will use the customers supplied version of the configuration item, rather than the Accelerator version.

The Accelerator was designed to allow customers complete customization capabilities without any requirement to update code or fork the GitHub repo. Additionally, rather than forcing customers to provide a multitude of config files for a standard or prescriptive installation, we provide and auto-deploy with Accelerator versions of most required configuration items from the reference-artifacts folder of the repo. If a customer provides the required configuration file in their Acclerator S3 input bucket, we will use the customer supplied version of the configuration file rather than the Accelerator version. At any time, either before initial installation, or in future, a customer can place updated SCPs, policies, or other supported file types into their input bucket and we will use those instead of Accelerator supplied versions. If a customer wishes to revert to the sample configuration, simply removing the specific files from their S3 bucket and rerunning the accelerator will revert to the repo version of the removed files. Customer only need to provide the specific files they wish to overide, not all files.

### 2.0.11. I wish to be in compliance with the 12 TBS Guardrails, what don't you cover with the provided sample architecture?

The AWS SEA allows for a lot of flexibility in deployed architectures. If used, the provided PBMM sample architecture was designed to deliver on the technical portion of _all_ 12 of the GC guardrails, when automation was possible.

What don't we cover? Assigning MFA to users is a manual process. Specifically you need to procure Yubikeys for your root/break glass users, and enable a suitable form of MFA for _all_ other users (i.e. virtual, email, other). The guardrails also include some organizational processes (i.e. break glass procedures, or signing an MOU with CCCS) which customers will need to work through independently.

While AWS is providing the tools to help customer be compliant with the 12 PBMM guardrails (which were developed in collaboration with the GC) - it's up to each customers ITSec organization to assess and determine if the deployed controls actually meet their security requirements.

Finally, while we started with a goal of delivering on the 12 guardrails, we believe we have extended well beyond those security controls, to further help customers move towards meeting the full PBMM technical control profile (official documentation is weak in this area at this time).

# 3. Notes

## 3.1. Upgrades

- Always compare your configuration file with the config file from the latest release to validate new or changed parameters or changes in parameter types / formats.
- Upgrades to `v1.2.1 and above` from v1.2.0 and below - if more than 5 VPC endpoints are deployed in any account (i.e. endpoint vpc in the shared network account), before upgrade, they must be removed from the config file and state machine executed to de-provision them. Up to approximately 50 endpoints can be re-deployed during the upgrade state machine execution. Skipping this step will result in an upgrade failure due to throttling issues.
- Upgrades to `v1.2.0 and above` from v1.1.9 and below require setting `account-warming-required` to `false`, (Perimeter and Ops accounts) or the rsyslog and firewalls will be removed and then re-installed on the subsequent state machine execution
- Upgrades from `v1.1.7 and below` require the one-time removal of incorrectly created and associated resolver rules for private DNS domains. While we created a manual [script](../reference-artifacts/Custom-Scripts/resolver-rule-cleanup.sh) to remove the incorrect associations, it is quicker to manually delete the incorrect associations using the console (`shared-network` account, Route 53, Resolvers).
- Upgrades from `v1.1.6 and below` require updating the `GithubRepository` in the CFN stack, as we renamed the GitHub repo with release v1.1.7 to `aws-secure-environment-accelerator`.
- Upgrades to `v1.1.5 and above` from v1.1.4 and below:
  - requires providing the "overrideComparison": true flag to the State Machine, as we are changing file formats and cannot compare to previous config file versions. Use extra caution, as we are not blocking breaking changes to the configuration file when this parameter is provided. (As the State Machine self-executes without the above parameter, it will fail on first run. Rerun the State Machine providing the parameter)
  - High probability of a State Machine failure due to a 1hr step timeout limitation. No easy fix available. Simply rerun the State Machine. We are reversing something from the v1.1.4 release which is extremely time consuming.

### 3.1.1. Summary of Upgrade Steps (all versions)

- Ensure a valid Github token is stored in secrets manager
- Update the config file in Code Commit with new parameters and updated parameter types based on the version you are upgrading to (this is important as features are iterating rapidly)
- If you are replacing your GitHub Token:
  - Take note of the s3 bucket name from the stack parameters
  - Delete the Installer CFN stack (`PBMMAccel-what-you-provided`)
  - Redeploy the Installer CFN stack using the latest template (provide bucket name and notification email address)
  - The pipeline will automatically run and trigger the upgraded state machine
- If you are using a pre-existing GitHub token:
  - Update the Installer CFN stack using the latest template, providing the `GithubBranch` associated with the release (eg. `release/v1.2.2`)
    - Go To Code Pipeline and Release the PBMMAccel-InstallerPipeline

## 3.2. Configuration File Hints and Tips

- You cannot supply (or change) configuration file values to something not supported by the AWS platform
  - For example, CWL retention only supports specific retention values (not any number)
  - Shard count - can only increase/reduce by half the current limit. i.e. you can change from `1`-`2`, `2`-`3`, `4`-`6`
- Always add any new items to the END of all lists or sections in the config file, otherwise
  - Update validation checks will fail (vpc's, subnets, share-to, etc.)
  - VPC endpoint deployments will fail - do NOT re-order or insert VPC endpoints (unless you first remove them all completely, execute the state machine, then re-add them, and again run the state machine) - this challenge no longer exists as of v1.2.1.
- To skip, remove or uninstall a component, you can simply change the section header, instead of removing the section
  - change "deployments"/"firewalls" to "deployments"/"xxfirewalls" and it will uninstall the firewalls and maintain the old config file settings for future use
  - Objects with the parameter deploy: true, support setting the value to false to remove the deployment
- As you grow and add AWS accounts, the Kinesis Data stream in the log-archive account will need to be monitored and have its capacity (shard count) increased by setting `"kinesis-stream-shard-count"` variable under `"central-log-services"` in the config file
- Updates to NACL's requires changing the rule number (`100` to `101`) or they will fail to update
- The sample firewall configuration uses an instance with **4** NIC's, make sure you use an instance size that supports 4 ENI's
- Re-enabling individual security controls in Security Hub requires toggling the entire security standard off and on again, controls can be disabled at any time
- Firewall names, CGW names, TGW names, MAD Directory ID, account keys, and ou's must all be unique throughout the entire configuration file (also true for VPC names given nacl and security group referencing design)
- The configuration file _does_ have validation checks in place that prevent users from making certain major unsupported configuration changes
- **The configuration file does _NOT_ have extensive error checking. It is expected you know what you are doing. We eventually hope to offer a config file, wizard based GUI editor and add the validation logic in this separate tool. In most cases the State Machine will fail with an error, and you will simply need to troubleshoot, rectify and rerun the state machine.**
- You cannot move an account between top-level ou's. This would be a security violation and cause other issues. You can move accounts between sub-ou. Note: The ALZ version of the Accelerator does not support sub-ou.
- v1.1.5 and above adds support for customer provided YAML config file(s) as well as JSON. In future we will be providing a version of the config file with comments describing the purpose of each configuration item
- Security Group names were designed to be identical between environments, if you want the VPC name in the SG name, you need to do it manually in the config file
- We only support the subset of yaml that converts to JSON (we do not support anchors)
- We do NOT support changing the `organization-admin-role`, this value must be set to `AWSCloudFormationStackSetExecutionRole` at this time.
- Adding more than approximately 50 _new_ VPC Interface Endpoints across _all_ regions in any one account in any single state machine execution will cause the state machine to fail due to Route 53 throttling errors. If adding endpoints at scale, only deploy 1 region at a time. In this scenario, the stack(s) will fail to properly delete, also based on the throttling, and will require manual removal.

## 3.3. Considerations: Importing existing AWS Accounts / Deploying Into Existing AWS Organizations

- The Accelerator _can_ be installed into existing AWS Organizations
  - our early adopters have all successfully deployed into existing organizations
- Existing AWS accounts _can_ also be imported into an Accelerator managed Organization
- Caveats:
  - Per AWS Best Practices, the Accelerator deletes the default VPC's in all AWS accounts, worldwide. The inability to delete default VPC's in preexisting accounts will fail the installation/account import process. Ensure default VPC's can or are deleted before importing existing accounts. On failure, either rectify the situation, or remove the account from Accelerator management and rerun the state machine
  - The Accelerator will NOT alter existing (legacy) constructs (e.g. VPC's, EBS volumes, etc.). For imported and pre-existing accounts, objects the Accelerator prevents from being created using preventative guardrails will continue to exist and not conform to the prescriptive security guidance
    - Existing workloads should be migrated to Accelerator managed VPC's and legacy VPC's deleted to gain the full governance benefits of the Accelerator (centralized flow logging, centralized ingress/egress, no IGW's, Session Manager access, existing non-encrypted EBS volumes, etc.)
  - Existing AWS services will be reconfigured as defined in the Accelerator configuration file (overwriting existing settings)
  - We do NOT support _any_ workloads running or users operating in the root AWS account. The root AWS account MUST be tightly controlled
  - Importing existing _workload_ accounts is fully supported, we do NOT support, recommend and strongly discourage importing mandatory accounts, unless they were clean/empty accounts. Mandatory accounts are critical to ensuring governance across the entire solution
  - We've tried to ensure all customer deployments are smooth. Given the breadth and depth of the AWS service offerings and the flexibility in the available deployment options, there may be scenarios that cause deployments into existing Organizations to initially fail. In these situations, simply rectify the conflict and re-run the state machine.

### 3.3.1. Process to import existing AWS accounts into an Accelerator managed Organization

- Newly invited AWS accounts in an Organization will land in the root ou
- Unlike newly created AWS accounts which immediately have a Deny-All SCP applied, imported accounts are not locked down as we do not want to break existing workloads (these account are already running without Accelerator guardrails)
- In AWS Organizations, select ALL the newly invited AWS accounts and move them all (preferably at once) to the correct destination OU (assuming the same OU for all accounts)
  - In case you need to move accounts to multiple OU's we have added a 2 minute delay before triggering the State Machine
  - Any accounts moved after the 2 minute window will NOT be properly ingested, and will need to be ingested on a subsequent State Machine Execution
- This will first trigger an automated update to the config file and then trigger the state machine after a 2 minute delay, automatically importing the moved accounts into the Accelerator per the destination OU configuration
- As previously documented, accounts CANNOT be moved between OU's to maintain compliance, so select the proper top-level OU with care
- If you need to customize each of the accounts configurations, you can manually update the configuration file either before or after you move the account to the correct ou
  - if before, you also need to include the standard 4 account config file parameters, if after, you can simply add your new custom parameters to the account entry the Accelerator creates
  - if you add your imported accounts to the config file, moving the first account to the correct ou will trigger the state machine after a 2 minutes delay. If you don't move all accounts to their correct ou's within 2 minutes, your state machine will fail. Simply finish moving all accounts to their correct ou's and then rerun the state machine.
- If additional accounts are moved into OUs while the state machine is executing, they will not trigger another state machine execution, those accounts will only be ingested on the next execution of the state machine
  - customers can either manually initiate the state machine once the current execution completes, or, the currently running state machine can be stopped and restarted to capture all changes at once
  - Are you unsure if an account had its guardrails applied? The message sent to the state machine Status SNS topic (and corresponding email address) on a successful state machine execution provides a list of all successfully processed accounts.
- The state machine is both highly parallel and highly resilient, stopping the state machine should not have any negative impact. Importing 1 or 10 accounts generally takes about the same amount of time for the Accelerator to process, so it may be worth stopping the current execution and rerunning to capture all changes in a single execution.
- We have added a 2 min delay before triggering the state machine, allowing customers to make muliple changes within a short timeframe and have them all captured automatically in the same state machine execution.

### 3.3.2. Deploying the Accelerator into an existing Organization

- As stated above, if the ALZ was previously deployed into the Organization, please work with your AWS account team to find the best mechanism to uninstall the ALZ solution
- Ensure all existing sub-accounts have the `AWSCloudFormationStackSetExecutionRole` installed and set to trust the root AWS Organization account
  - we have provided a CloudFormation stack which can be executed in each sub-account to simplify this process
- As stated above, we recommend starting with new AWS accounts for the mandatory functions (shared-network, perimeter, security, log-archive accounts).
- To better ensure a clean initial deployment, we also recommend the installation be completed while ignoring most of your existing AWS sub-accounts, importing them post installation:
  - create a new OU (i.e. `Imported-Accounts`), placing most of the existing accounts into this OU temporarily, and adding this OU name to the `global-options\ignored-ous` config parameter;
  - any remaining accounts must be in the correct ou, per the Accelerator config file;
  - install the Accelerator;
  - import the skipped accounts into the Accelerator using the above import process, paying attention to the below notes
- NOTES:
  - Do NOT move any accounts from any `ignored-ous` to the root ou, they will immediately be quarantined with a Deny-All SCP, they need to be moved directly to their destination ou
  - As stated above, when importing accounts, there may be situations we are not able to fully handle
    - If doing a mass import, we suggest you take a quick look and if the solution is not immediately obvious, move the account which caused the failure back to ignored-ous and continue importing the remainder of your accounts. Once you have the majority imported, you can circle back and import outstanding problem accounts with the ability to focus on each individual issue
    - The challenge could be as simple as someone has instances running in a default VPC, which may require some cleanup effort before we can import (coming soon, you will be able to exclude single account/region combinations from default VPC deletion to gain the benefits of the rest of the guardrails while you migrate workloads out of the default VPC)

## 3.4. Design Constraints

- The root account does NOT have any preventative controls to protect the integrity of the Accelerator codebase, deployed objects or guardrails. Do not delete, modify, or change anything in the root account unless you are certain as to what you are doing. More specifically, do NOT delete, or change _any_ buckets in the root account.
- While generally protected, do not delete/update/change s3 buckets with CDK, CFN, or PBMMAccel- in _any_ sub-accounts.- ALB automated deployments only supports Forward and not redirect rules.
- AWS Config Aggregator is deployed in the Organization root account as enablement through Organizations is simpler to implement. AWS Organizations only supports deploying the Aggregator in the Org root account and not in a designated administrative account at this time. Once supported, we plan to update the code to move the Aggregator administrative account.
- An Organization CloudTrail is deployed, which is created in the primary region in the root AWS account. All AWS account CloudTrails are centralized into this single CloudWatch Log Group. Starting in v1.1.9 this is where we deploy the CloudWatch Alarms which trigger for ALL accounts in the organization. Security Hub will erroneously report that the only account and/or region that is compliant with certain rules is the primary region of the root account. We are working with the Security Hub team to rectify this situation in future Security Hub/Accelerator releases.
- Amazon Detective - we have chosen not to enable at this time.
- Only 1 auto-deployed MAD per AWS account is supported today.
- VPC Endpoints have no Name tags applied as CloudFormation does not currently support tagging VPC Endpoints.
- If the root account coincidentally already has an ADC with the same domain name, we do not create/deploy a new ADC. You must manually create a new ADC (it won't cause issues).
- Firewall updates are to be performed using the firewall OS based update capabilities. To update the AMI using the Accelerator, you must first remove the firewalls and then redeploy them (as the EIP's will block a parallel deployment), or deploy a second parallel FW cluster and de-provision the first cluster when ready.

# 4. AWS Internal - Accelerator Release Process

## 4.1. Creating a new Accelerator Code Release

1. Ensure `master` is in a suitable state
2. Disable branch protection for both the `master` branch and for the `release/` branches
3. Create a version branch with [SemVer](https://semver.org/) semantics and a `release/` prefix: e.g. `release/v1.0.5`

   - On latest `master`, run: `git checkout -b release/vX.Y.Z`
   - **Important:** Certain git operations are ambiguous if tags and branches have the same name. Using the `release/` prefix reserves the actual version name for the tag itself; i.e. every `release/vX.Y.Z` branch will have a corresponding `vX.Y.Z` tag.

4. Push that branch to GitHub (if created locally)

   - `git push origin release/vX.Y.Z`

5. The release workflow will run, and create a **DRAFT** release if successful with all commits since the last tagged release.
6. Prune the commits that have been added to the release notes (e.g. remove any low-information commits)
7. Publish the release - this creates the git tag in the repo and marks the release as latest. It also bumps the `version` key in several project `package.json` files.
8. Re-enable branch protection for both the `master` branch and for the `release/` branches

   - Note: The `Publish` operation will run [the following GitHub Action][action], which merges the `release/vX.Y.Z` branch to `master`. **Branch Protection in GitHub will cause this to fail**, and why we are momentarily disabling branch protection.

   [action]: https://github.com/aws-samples/aws-secure-environment-accelerator/blob/master/.github/workflows/publish.yml

9. Note that a successful run of this workflow will automatically kick off the "Generate Documentation" workflow. That workflow may be initiated at any time manually via the GitHub Actions UI (since it is configured as a `workflow_dispatch` action).

---

[...Return to Accelerator Table of Contents](../index.md)
