# 1. Operations - How to migrate an Amazon Landing Zone (ALZ) account "as is" into an Amazon Secure Environment Accelerator.

## 1.1. Table of Contents

<!-- TOC depthFrom:1 depthTo:4 -->

- [1. Operations & Troubleshooting Guide](#1-operations--troubleshooting-guide)
  - [1.1. Table of Contents](#11-table-of-contents)
- [2. Purpose](#2-purpose)
- [3. System Overview](#3-system-overview)
  - [3.1. Initial Setup Stack](#32-initial-setup-stack)
    - [3.2.1. Get or Create Configuration from S3](#321-get-or-create-configuration-from-s3)
    - [3.2.2. Get Baseline from Configuration](#322-get-baseline-from-configuration)
- [4. Troubleshooting](#4-troubleshooting)
  - [4.1. Components](#41-components)
    - [4.1.1. State Machine](#411-state-machine)

<!-- /TOC -->

# 2. Purpose

This document describes the steps to migrate an existing Linked account from an Amazon Landing Zone (ALZ) to an Amazon Secure Environment Accelerator.

## 1. Prerequisites (Setup)

The Accelerator-management `Installer` stack contains the necessary resources to deploy the Accelerator-management `Initial Setup` stack in an AWS account. This AWS account will be referred to as the 'root' account in this document.

## 1.0.

Run initial tests on the ASEA with SSO and permission sets with an account under the appropriate OU.  Ensure that AWS SSO is properly configured to have the accounts and permission sets for the team whose account is being migrated over. This would include configuration of the ASEA’s AWS Managed Active Directory (MAD) which should align with how the team migrating their account has their AWS SSO and MAD configured today.

## 1.1.

If working with your AWS acconut team (TAM/SA), they will reach out to an internal team to request the linked account be switched to invoicing.  This way the customer doesn’t have to enter a credit card when making the account standalone in the upcoming steps.


### 3.2.1. Get or Create Configuration from S3

This step calls a Lambda function that finds or creates the configuration repository. Finds the configuration file(s) in the CodeCommit repository. If the configuration file cannot be found in the repository it is copied from the customer's S3 configuration bucket. If the copy is successful then the configuration file(s) in the S3 bucket will be removed.
