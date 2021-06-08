# Operations - How to migrate an Amazon Landing Zone (ALZ) account "as is" into an Amazon Secure Environment Accelerator.

<!-- TOC depthFrom:1 depthTo:4 -->

- [1. Prerequisites (Setup)](#1-prerequisites-setup)
- [2. Landing Zone - Disassociate the account from the Landing Zone](#2-landing-zone---disassociate-the-account-from-the-landing-zone)
- [3. Landing Zone - Remove the account from the landing Zone (ALZ) organizations and make standalone](#3-landing-zone---remove-the-account-from-the-landing-zone-alz-organizations-and-make-standalone)
- [4. Accelerator (ASEA) - Invite the account into it's organization](#4-acceleartor-asea---invite-the-account-into-its-organization)
- [5. Accelerator (ASEA) - Move the linked account from top level root OU into appropriate OU managed by ASEA](#5-acceleartor-asea---move-the-linked-account-from-the-top-level-root-ou-into-appropriate-ou-managed-by-asea)
- [6. Accelerator (ASEA) - Verify access control via roles, SSO, etc](#6-acceleartor-asea---verify-access-control-via-roles-sso-etc)
- [7. Landing Zone - Close down the remainder of the Landing zone core accounts and then the mgmt. account](#7-landing-zone---close-down-the-remainder-of-the-landing-zone-core-accounts-and-then-the-mgmt-account)

# Purpose

This document describes the steps to migrate an existing Linked account from an Amazon Landing Zone (ALZ) to an Amazon Secure Environment Accelerator.

## 1. Prerequisites (Setup)

The Accelerator-management `Installer` stack contains the necessary resources to deploy the Accelerator-management `Initial Setup` stack in an AWS account. This AWS account will be referred to as the 'root' account in this document.

### 1.0.

Run initial tests on the ASEA with SSO and permission sets with an account under the appropriate OU.  Ensure that AWS SSO is properly configured to have the accounts and permission sets for the team whose account is being migrated over. This would include configuration of the ASEA’s AWS Managed Active Directory (MAD) which should align with how the team migrating their account has their AWS SSO and MAD configured today.

### 1.1.

If working with your AWS acconut team (TAM/SA), they will reach out to an internal team to request the linked account be switched to invoicing.  This way the customer doesn’t have to enter a credit card when making the account standalone in the upcoming steps.

### 1.2.

Confirm the customer has access to the email account associated to each of the ALZ AWS linked account(s) being migrated to the ASEA, as well as access to the AWS linked account itself.  This runbook will first make the account standalone (remove from ALZ organizations) so we want to make sure the customer has root access to the account and that the email address attached to the account is available before running this procedure.  If needed you can reset the linked account root password by following: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_change-root.html

### 1.3.

If the customer is an Enterprise Support customer and has ES enabled at the ALZ mgmt account level, then make sure ES is enabled on each of the linked accounts being migrated to the ASEA.   If it’s not, then raise a support case to activate ES on the linked account(s) being migrated to the ASEA.    This is to make sure an ES support case can be created and escalated during step 2 (if any unforeseen issue occurs).

### 1.4.

Make sure the ALZ Pipeline is running cleanly.    Execute the ALZ Code Pipeline from the mgmt account to make sure it has a clean run.
- AWS→CodePipeline
- Select “AWS-Landing-Zone-CodePipeline”
- Select “Release Change”
- Click on the pipeline and confirm it successfully runs through to completion

### 1.5.

Confirm SSO temporary command line access from the mgmt account with an SSO user with AdminAccess. Confirm you have the AWS CLI tool installed.
- SSO login → Select linked account → “Command line or programmatic access”
  - Select Option 2 and add to your AWS credentials file under “[default]“
  - his is required as the python script in step 3 takes a “profile” paramater
- CLI - https://aws.amazon.com/cli/
- Confirm by running a command such as “aws s3 ls”

### 1.6.

Make sure you have python3 and the AWS python library (boto3) installed which is required in step 2 to confirm the account has been disassociated from the landing zone.
- BOTO3 - https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html

## 2. Landing Zone - Disassociate the account from the Landing Zone

- 2.0 - Login to the ALZ management account, and go to “Service Catalog” -> “Provisioned products”
- 2.1 - Select “Access Filter” -> “Account” to see a list of the account products

### 2.2. Select the product for the specific linked account 
- Put the linked account name in the provisioned products search bar
- This will narrow down the list and show a product name “AWS-Landing-Zone-Account-Vending-Machine” with a name *“lz_applicaitons_<ACCOUNT_NAME>_<date>”*
- Select that product and then “Actions->Terminate”
  
### 2.3. Confirm that successfully terminates
- The provisioned product entry will show Status “Under change”
- You can also verify by going to CloudFormation→Stacks and you will see “DELETE IN PROGRESS” for the AVM Template stack being deleted. 
  - Go to the Resources tab to see the deleted resources associated to this stack.
- Once the provisioned product no longer says “Under change” move to the next step.  
- Please note, this can take 1-2 hours.

### 2.4. Go to the linked account (assume role)
- From mgmt account, assume role to the linked account with role “AWSCloudFormationStackSetExecutionRole”
  - or optionally, SSO with console access to that account

### 2.5. Under “CloudFormation” verify that the ALZ Stacks (StackSets from ALZ mgmt) were deleted.  
- There should be no stack left in the linked account with the prefix “StackSet-AWS-Landing-Zone-Baseline*.".  For example:
  - StackSet-AWS-Landing-Zone-Baseline-CentralizedLoggingSpoke-
  - StackSet-AWS-Landing-Zone-Baseline-EnableConfigRules-
  - StackSet-AWS-Landing-Zone-Baseline-EnableNotifications-
  - StackSet-AWS-Landing-Zone-Baseline-EnableConfigRulesGlobal-
  - StackSet-AWS-Landing-Zone-Baseline-EnableConfig-
  - StackSet-AWS-Landing-Zone-Baseline-ConfigRole-
  - StackSet-AWS-Landing-Zone-Baseline-IamPasswordPolicy-
  - StackSet-AWS-Landing-Zone-Baseline-SecurityRoles-
  - StackSet-AWS-Landing-Zone-Baseline-EnableCloudTrail-
  
### 2.6. Verify that the accounts are ready to be invited to the ASEA and baselined by ASEA:
- You need to ensure that resources don’t exist in the default VPC, there is no config recorder channel, no CloudTrail Trail and STS is active in all regions.
- This can be done manually, but ideally use this python script that can be run as well to automate the verification
  - https://github.com/paulbayer/Inventory_Scripts/blob/mainline/ALZ_CheckAccount.py
  - mkdir test; cd test
  - git clone https://github.com/paulbayer/Inventory_Scripts.git
  - python3 ALZ_CheckAccount.py -a <LINKED ACCOUNT> -p default
- It will run through 5 steps and output the following.   If you were to run this script before the “terminate” step above is complete you would have warnings in steps 2 and 3 below.
  - Step 0 completed without issues
  - Checking account 111122223333 for default VPCs in any region
  - Step 1 completed with no issues
  - Checking account 111122223333 for a Config Recorders and Delivery Channels in any region
  - Step 2 completed with no issues
  - Checking account 111122223333 for a specially named CloudTrail in all regions
  - Step 3 completed with no issues
  - Checking account 111122223333 for any GuardDuty invites
  - Step 4 completed with no issues
  - Checking that the account is part of the AWS Organization.
  - Step 5 completed with no issues
  - We've found NO issues that would hinder the adoption of this account ****  
  
  
## 3. Landing Zone - Remove the account from the landing Zone (ALZ) organizations and make standalone

Removing the account from the ALZ organizations to standalone is required so that the ASEA can invite this account into its organization.
  
### 3.0. Read the following summary/considerations
- https://aws.amazon.com/premiumsupport/knowledge-center/organizations-move-accounts/

### 3.1. Verify access
- As stated in the previous sections, verify you have a mechanism to get access to the account post leaving the ALZ organization
  - Former SSO roles will no longer function nor will the “AWSCloudFormationStackSetExecutionRole” as it was locked to the previous org root account
  - Could be as simple as ensuring the root credentials have been recovered and are usable
  - Could be a new role/IAM user with Admin access within the account

### 3.2. Verify billing flipped to invoicing
 - As stated in the previous sections, verify the account billing has been flipped to “invoicing” to avoid having to enter a Credit Card when going standalone.  This can be done working with your AWS account team who will coordinate internally, or by raising a support case describing the use case.

### 3.3. Remove the account from the organizations and make standalone
- Follow the instructions on the following link to remove the account.  
- Short version is select the account from the ALZ mgmt account Organizations and select "remove".
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_remove.html
- https://aws.amazon.com/blogs/security/aws-organizations-now-supports-self-service-removal-of-accounts-from-an-organization
- Note, when moving the account standalone you won’t (do not select) Enterprise Support.  You shouldn't get a popup dialog asking for Credit Card and Support level since the account should have been moved to invoicing.  Support can be reenabled on the linked account once it’s invited into the ASEA mgmt account that has ES already active (if ASEA has ES active on the mgmt account).

## 4. Acceleartor (ASEA) - Invite the account into it's organization

### 4.1 From the ASEA mgmt account, send an invite to the account (now standalone)
- Follow the instructions on the following link to invite the account. 
- Short version is go to the ASEA mgmt account organizations and select "Add an account" - "Invite existing account" - "enter the linked account account ID"
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_invites.html
  
### 4.2 In the former ALZ account, Accept the invitation 
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_invites.html#orgs_manage_accounts_accept-decline-invite
  
### 4.3 Keep the linked account at the root level of the Organization (for now)
- Verify access to the linked account using existing login credentials (ie-root, etc)
  
### 4.4 Activate Enterprise Support (ES) on this linked account
- If ES is enabled on the ASEA mgmt account, open a support case to enable ES on this linked account
- Go to the Support center and open billing support case, with Account and Activation.
- Subject "Requesting ES enablement on linked account"
- Body "Requesting ES enablement on linked account <ACCOUNT ID>"
- AWS TAM will escalate the case with the support team if it’s time sensitive.  
- This is to make sure an ES support case can be created and escalated during the next step if any unforeseen issue occurs.
  
### 4.5 Update (or add) the Organization Adming Role so one can assume the role into the linked account.
- Login to the linked account which just joined the organization.  
- Create a new Organization Admin role, as defined in the customers config file: *"organization-admin-role": "OrganizationAccountAccessRole".
- With newer customers the default is "OrganizationAccountAccessRole, with older customers it is: "AWSCloudFormationStackSetExecutionRole".  
- If "AWSCloudFormationStackSetExecutionRole" then you can edit the trust relationship directly
  - Go to IAM -> Role -> AWSCloudFormationStackSetExecutionRole 
  - Update the trust relationship to have the mgmt account ID of the ASEA (instead of the account ID of the previous ALZ)
- Note, there is also a CFN stack which will create this role here: \reference-artifacts\Custom-Scripts\Import-Account-CFN-Role-Template.yml

## 5. Acceleartor (ASEA) - Move the linked account from the top level root OU into appropriate OU managed by ASEA

### 5.0. Plan what OU this account will be moved into
- Option 1 - Create a new OU and move account into that OU 
  - Before the migration the team would have created a new OU (ie-similar to the sandbox OU).
  - This would be needed if they need to isolate this account from TGW attachments/Networking and want to keep it isolated.
  - The state machine will run and start to baseline the account. it will create a new VPC and deploy resources using CFN such as config, cloudtrail trail, etc.
  - If the OU is setup similar to sandbox OU it does not provide access to the shared VPCs that have the TGW attachments. Truly standalone.
  - Creating a new OU in AWS Orgs also requires adding that new OU and the OU persona to the config file in advance of the next state machine execution.  
- Option 2 - Move account into an existing OU (ie-prod)
  - The state machine will run and start to baseline the account. it will create a new VPC and deploy resources using CFN such as config, cloudtrail trail, etc.
  - You would be creating a new VPC within the account or sharing the existing SEA based OU VPC into the account.  
  - The customers existing VPC will remain, as a 2nd DETACHED VPC.  
  - If it is non-compliant to security rules, it remains non-compliant and needs to be cleaned up and brought into compliance/potentially have workloads migrated to the existing VPC.  if the VPC is compliant, and it has unique IP addresses, it COULD be attached to the TGW.

### 5.1. Move the account from the root OU to the correct OU
- THIS CANNOT BE EASILY UNDONE - MAKE SURE YOU MOVE TO THE CORRECT OU
- Follow the instructions on the following link to move the account to the proper OU 
- Short version is go to the ASEA mgmt account organizations and select the account - "actions" - "move" - and select the correct OU
- NOTE: The ASEA state machine will start within 1-2 minutes of the account being moved into the OU
- https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous.html#move_account_to_ou
- Verify that the ASEA main state machine (under AWS->Step Functions) is triggered and runs cleanly (~30-45 minutes)
  
## 6. Acceleartor (ASEA) - Verify access control via roles, SSO, etc
- Update and verify SSO/permission sets for the linked account now part of the ASEA
- Verify you still have access to the linked account via root (or other mechanisms)
- Verify you still can assume the operations role into the linked 
  
## 7. Landing Zone - Close down the remainder of the Landing zone core accounts and then the mgmt. account

### 7.1. Close down the ALZ linked accounts
- Once all the workload accounts are migrated and functional within the ASEA then close down the ALZ 
- Close all the linked accounts “as is” without making them standalone
- https://aws.amazon.com/premiumsupport/knowledge-center/close-aws-account
- The mgmt. account will remain with organizations and the core accounts will show as suspended for 90 days.
  
### 7.2. Close down the ALZ mgmt account
- After 90 days, the suspended linked accounts will be completely closed.  
- Go to the root account and turn off Organizations and then close the root account.



