# Operations - How to migrate an Amazon Landing Zone (ALZ) account "as is" into an Amazon Secure Environment Accelerator.

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
    * AWS→CodePipeline
    * Select “AWS-Landing-Zone-CodePipeline”
    * Select “Release Change”
    * Click on the pipeline and confirm it successfully runs through to completion

### 1.5.

Confirm SSO temporary command line access from the mgmt account with an SSO user with AdminAccess. Confirm you have the AWS CLI tool installed.
    * SSO login → Select linked account → “Command line or programmatic access”
        * Select Option 2 and add to your AWS credentials file under “[default]“
        * This is required as the python script in step 3 takes a “profile” paramater
    * CLI - https://aws.amazon.com/cli/
    * Confirm by running a command such as “aws s3 ls”

### 1.6.

Make sure you have python3 and the AWS python library (boto3) installed which is required in step 2 to confirm the account has been disassociated from the landing zone.
    * BOTO3 - https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html

