# 1. How to migrate an AWS Landing Zone (ALZ) account "as is" into an AWS Secure Environment Accelerator (ASEA)

## 1.1. Overview

This document describes the steps to migrate an existing linked account from an AWS Landing Zone (ALZ) to an AWS Secure Environment Accelerator (ASEA).

## 1.2. Prerequisites / Setup

### 1.2.1. Confirm ASEA SSO and OU configuration

On the ASEA, setup and run initial tests with SSO and permission sets with an account under the OU where the linked account will be migrated to. Confirm that SSO is properly configured with permissions required for the team members whose account is being migrated. This would include configuration of the ASEA’s AWS Managed Active Directory (MAD) which should align with how the team migrating their account has their AWS SSO and MAD configured today.

### 1.2.2. Switch the ALZ linked account payment method to invoicing

If working with your AWS account team (TAM/SA) they will reach out to an internal team within AWS to have the linked account payment method switched to invoicing. This way the customer doesn’t have to enter a credit card when making the account standalone in the upcoming steps.

### 1.2.3. Confirm console access to the ALZ linked account and also to the email account

Confirm you have access to login as root to the ALZ linked account AWS console. Confirm you have access to the email account associated to the ALZ linked account. The upcoming steps will first make the account standalone (remove from ALZ organizations) so you need to make sure you have root access to the account. If required, you can reset the password following: <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_change-root.html>

### 1.2.4. If an Enterprise Support (ES) customer, then confirm ES is enabled on the ALZ linked account

If the ALZ management account is on Enterprise Support (ES), then make sure ES is enabled on the linked account being migrated to the ASEA. If its not, then raise a support case to activate ES on the linked account. This is to make sure an ES support case can be created and escalated during step 2 if any unforeseen issue occurs.

### 1.2.5. Confirm the ALZ CodePipeline is executing successfully

Make sure the ALZ CodePipeline is still running successfully. Execute the ALZ CodePipeline from the management account to make sure it runs successfully.

-   AWS Console -> CodePipeline
-   Select “AWS-Landing-Zone-CodePipeline”
-   Select “Release Change”
-   Click on the pipeline and confirm it successfully runs through to completion

### 1.2.6. Confirm CLI access and setup Python and the AWS Python SDK (boto3)

Confirm SSO temporary command line access from the management account with AdminAccess.

-   SSO login → Select linked account → “Command line or programmatic access”
    -   Select Option 2 and add to your AWS credentials file under “[default]“
    -   This is required as the python script in step 3 takes a “profile” parameter
-   Confirm you have the AWS CLI tool installed.
    -   <https://aws.amazon.com/cli/>
    -   Confirm by running a command such as “aws s3 ls”
-   Confirm you have python3 and the AWS python library (boto3) installed which is required in step 2 to confirm the account has been disassociated from the landing zone correctly.
    -   <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html>

## 1.3. Landing Zone - Disassociate the account from the ALZ

-   Login to the ALZ management account, and go to “Service Catalog” -> “Provisioned products”
-   Select “Access Filter” -> “Account” to see a list of the account products

### 1.3.1. Select the product for the specific linked account

-   Put the linked account name in the provisioned products search bar
-   This will narrow down the list and show a product name “AWS-Landing-Zone-Account-Vending-Machine” with a name _“lz*applicaitons*<ACCOUNT*NAME>*<date>”_
-   Select that product and then “Actions->Terminate”

### 1.3.2. Confirm the product successfully terminates

-   The provisioned product entry will show a status of “Under change”
-   You can also verify by going to CloudFormation→Stacks and you will see “DELETE IN PROGRESS” for the AVM Template stack being deleted.
    -   Go to the Resources tab to see the deleted resources associated to this stack.
-   Once the provisioned product no longer says “Under change” move to the next step.
-   Please note, this can take 1-2 hours.

### 1.3.3. Go to the linked account (assume role)

-   From the management account, assume the role “AWSCloudFormationStackSetExecutionRole” to the linked account
    -   or optionally, SSO with console access to that account

### 1.3.4. Under “CloudFormation” verify that the ALZ Stacks (StackSets from ALZ mgmt) were deleted

-   There should be no stack left in the linked account with the prefix “StackSet-AWS-Landing-Zone-Baseline\*". For example:
    -   StackSet-AWS-Landing-Zone-Baseline-CentralizedLoggingSpoke-
    -   StackSet-AWS-Landing-Zone-Baseline-EnableConfigRules-
    -   StackSet-AWS-Landing-Zone-Baseline-EnableNotifications-
    -   StackSet-AWS-Landing-Zone-Baseline-EnableConfigRulesGlobal-
    -   StackSet-AWS-Landing-Zone-Baseline-EnableConfig-
    -   StackSet-AWS-Landing-Zone-Baseline-ConfigRole-
    -   StackSet-AWS-Landing-Zone-Baseline-IamPasswordPolicy-
    -   StackSet-AWS-Landing-Zone-Baseline-SecurityRoles-
    -   StackSet-AWS-Landing-Zone-Baseline-EnableCloudTrail-

### 1.3.5. Verify that the account is ready to be invited and baselined by the ASEA

-   You need to ensure that resources don’t exist in the default VPC, there is no config recorder channel, no CloudTrail Trail and STS is active in all regions.
-   This can be done manually, but ideally use this python script that can be run as well to automate the verification
    -   <https://github.com/paulbayer/Inventory_Scripts/blob/mainline/ALZ_CheckAccount.py>
    -   mkdir test; cd test
    -   git clone <https://github.com/paulbayer/Inventory_Scripts.git>
    -   python3 ALZ_CheckAccount.py -a LINKED ACCOUNT_HERE -p default
-   It will run through 5 steps and output the following. If you were to run this script before the “terminate” step above is complete you would have warnings in steps 2 and 3 below.
    -   Step 0 completed without issues
    -   Checking account 111122223333 for default VPCs in any region
    -   Step 1 completed with no issues
    -   Checking account 111122223333 for a Config Recorders and Delivery Channels in any region
    -   Step 2 completed with no issues
    -   Checking account 111122223333 for a specially named CloudTrail in all regions
    -   Step 3 completed with no issues
    -   Checking account 111122223333 for any GuardDuty invites
    -   Step 4 completed with no issues
    -   Checking that the account is part of the AWS Organization.
    -   Step 5 completed with no issues
    -   We've found NO issues that would hinder the adoption of this account \*\*\*\*

## 1.4. Landing Zone (ALZ) - Remove the account from the ALZ organizations and make standalone

Removing the account from the ALZ organizations and making it standalone is required so it can be invited into the ASEA organization.

### 1.4.1. Read the following summary/considerations

-   <https://aws.amazon.com/premiumsupport/knowledge-center/organizations-move-accounts/>

### 1.4.2. Verify access

-   As stated in the previous sections, verify you have a mechanism to access the account post leaving the ALZ organization
    -   Former SSO roles will no longer function nor will the “AWSCloudFormationStackSetExecutionRole” role as it will have a trust relationship to the ALZ management account.
    -   Confirm the root credentials have been recovered and are usable
    -   As an alternative, confirm access with a new role/IAM user with Admin permissions on the account

### 1.4.3. Verify billing flipped to invoicing

-   As stated in the previous sections, verify the account payment method has been flipped to “invoicing” to avoid having to enter a Credit Card when going standalone. This can be done working with your AWS account team who will coordinate internally, or by raising a support case describing the use case.

### 1.4.4. Remove the account from the organizations and make standalone

-   Follow the instructions on the following link to remove the account
-   The short version is select the account from the ALZ mgmt account Organizations and select "remove"
-   <https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_remove.html>
-   <https://aws.amazon.com/blogs/security/aws-organizations-now-supports-self-service-removal-of-accounts-from-an-organization>
-   Note, when moving the account standalone do not select Enterprise Support. You shouldn't get a popup dialog asking for a Credit Card and the Support level since the account should have been moved to invoicing. Support can be reenabled on the linked account once it’s invited into the ASEA organization.

## 1.5. Accelerator - Invite the account into its organization

### 1.5.1. From the ASEA mgmt account, send an invite to the standalone account

-   Follow the instructions on the following link to invite the account
-   The short version is go to the ASEA mgmt account organizations and select "Add an account" -> "Invite existing account" -> "enter the linked account account ID"
-   <https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_invites.html>

### 1.5.2. In the former ALZ account, Accept the invitation

-   <https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_invites.html#orgs_manage_accounts_accept-decline-invite>

### 1.5.3. Keep the linked account at the root level of the Organizations

-   Verify access to the linked account using your root login credentials
-   If you had created an IAM role/user with Admin permissions, then verify access as well

### 1.5.4. Activate Enterprise Support (ES) on this linked account

-   If ES is enabled on the ASEA management account, open a support case to enable ES on this linked account
-   Go to the Support center and create a billing support case with "Account" and "Activation"
-   Subject "Requesting ES enablement on linked account"
-   Body "Requesting ES enablement on linked account <ACCOUNT-ID-HERE>"
-   Your AWS TAM can escalate the case with the support team if it’s time sensitive.
-   This is to make sure an ES support case can be created and escalated during the next steps if any unforeseen issue occurs.

### 1.5.5. Update (or add) the Organization Adming Role so one can assume the role into the linked account

-   Login to the linked account which just joined the organization.
-   Create a new Organization Admin role, as defined in the customers config file: "organization-admin-role": "OrganizationAccountAccessRole".
-   With newer customers the default is "OrganizationAccountAccessRole, with older customers it is "AWSCloudFormationStackSetExecutionRole".
-   If "AWSCloudFormationStackSetExecutionRole" then you can edit the trust relationship directly
    -   Go to IAM -> Role -> AWSCloudFormationStackSetExecutionRole
    -   Update the trust relationship to have the management account ID of the ASEA (instead of the account ID of the previous ALZ)
-   Verify that you can assume this role from the management account into the linked account

## 1.6. Accelerator - Move the linked account from the top level root OU into the appropriate OU managed by the ASEA

### 1.6.1. Plan what OU this account will be moved into

-   Option 1 - Create a new OU and move the account into that OU
    -   Before the migration, the team would have created a new OU (ie-similar to the sandbox OU).
    -   This would be needed if they need to isolate this account from TGW attachments/Networking and want to keep it isolated.
    -   The state machine will run and start to baseline the account.
    -   It will create a new VPC and deploy resources using CFN such as Config, CloudTrail, etc.
    -   Note, if the OU is setup similar to the sandbox OU it does not provide access to the shared VPCs that have the TGW attachments.
    -   Creating a new OU also requires adding that new OU and the OU persona to the config file in advance of the next state machine execution.
-   Option 2 - Move account into an existing OU (ie-prod)
    -   The state machine will run and start to baseline the account.
    -   It will create a new VPC and deploy resources using CFN such as Config, CloudTrail, etc.
    -   The customers existing VPC will remain, as a 2nd DETACHED VPC.
    -   Mote. if it is non-compliant to security rules, it remains non-compliant and needs to be cleaned up and brought into compliance
    -   If the VPC is compliant and it has unique IP addresses, it could be attached to the TGW.

### 1.6.2. Move the account from the root OU to the correct OU

-   THIS CANNOT BE EASILY UNDONE - MAKE SURE YOU MOVE TO THE CORRECT OU
-   Follow the instructions on the following link to move the account to the correct OU
-   The short version is go to the ASEA management account organizations and "select the account" -> "actions" -> "move" -> "select the correct OU"
-   NOTE: The ASEA state machine will automatically start within 1-2 minutes of the account being moved into the OU
-   <https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous.html#move_account_to_ou>
-   Verify that the ASEA main state machine (under AWS->Step Functions) is triggered and runs cleanly (~30-45 minutes)

## 1.7. Accelerator (ASEA) - Verify access control with roles, SSO, etc

-   Update and verify SSO and permission sets for the linked account now part of the ASEA
-   Verify you still have access to the linked account via root (or other mechanisms)
-   Verify you still can assume the operations role into the linked account

## 1.8. Landing Zone - Close down the ALZ core accounts and then the management account

Once all workloads have been migrated from the ALZ to the ASEA, then you may decide to shutdown your ALZ.

### 1.8.1. Close down the ALZ linked accounts

-   Close all the linked accounts “as is” without making them standalone
-   This will be the ALZ core linked accounts, but you might have some remaining workload accounts you decided not to migrate to the ASEA.
-   <https://aws.amazon.com/premiumsupport/knowledge-center/close-aws-account>
-   The management account will remain with organizations and the core accounts will show as suspended for 90 days.

### 1.8.2. Close down the ALZ management account

-   After 90 days, the suspended linked accounts will be completely closed
-   Go to the root account and turn off Organizations and then close the root account
