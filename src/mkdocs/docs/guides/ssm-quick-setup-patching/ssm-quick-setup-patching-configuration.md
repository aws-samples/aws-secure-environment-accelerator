# 1. ASEA Configuration for AWS Systems Manager Quick Setup patch policy

## 1.1. Overview

With Quick Setup, a capability of AWS Systems Manager, you can create patch policies powered by Patch Manager. A patch policy defines the schedule and baseline to use when automatically patching your Amazon Elastic Compute Cloud (Amazon EC2) instances and other managed nodes. Using a single patch policy configuration, you can define patching for all accounts in multiple AWS Regions in your organization, for only the accounts and Regions you choose, or for a single account-Region pair.

Beginning December 22, 2022, Patch Manager offers a new, recommended method to configure patching for your organization and AWS accounts through the use of patch policies.

A patch policy is a configuration you set up using Quick Setup. Patch policies provide more extensive and more centralized control over your patching operations than is available with previous methods of configuring patching. Patch policies can be used with all operating systems supported by Patch Manager, including supported versions of Linux, macOS, and Windows Server.

Reference: https://docs.aws.amazon.com/systems-manager/latest/userguide/patch-manager-policies.html, https://docs.aws.amazon.com/systems-manager/latest/userguide/quick-setup-patch-manager.html

## 1.2 Configuration Overview

> The Quick Setup patch policy, described on this page, should only be configured AFTER a successful ASEA installation. 

The Quick Setup patch policy is configured within the AWS Systems Manager console. The choices made in the configuration are used as inputs into two CloudFormation Stack Sets: Management ('MA'), and Target Accounts ('TA'). There are a few challenges that restrict the deployment and usage of the Quick Setup within the ASEA; thus, the purpose of creating this content. The challenges are:
- The 'TA' Stack Set hardcodes a Retention on CloudWatch Log (CWL) Groups. CWL Groups are protected by the ASEA SCPs, so this StackSet deployment fails in its default configuration.
- The patch policy configuration, from the Quick Setup, is saved in a S3 bucket, and is used by EC2 SSM Patching. Therefore, the EC2 IAM Instance Profile Roles must have S3 GetObject permissions on this specific S3 bucket.
- That S3 bucket has a resource policy that denies all GetObject requests if the Role does not have a specific Tag and Tag value. Today, the ASEA config lacks the ability to apply tags to IAM Roles. As an example, the default ASEA configuration deploys 'EC2-Default-SSM-AD-Role' that would need Tags and S3:GetObject permissions.

The solution, described in detail below, includes the following:
- Manual modification of the 'TA' StackSet template to remove the hardcoded CWL retenion.
- The creation of a policy, which contains a specific S3:GetObject, that is configured on IAM Roles.
- The creation of a custom AWS Config Rule that inspects Tags on specific IAM Roles. If a target role does not have the specific Quick Setup patch policy Tag, the Role will be 'Non-Compliant'.
- The creation of a SSM Document that can apply Tags to IAM Roles. This is used to auto-remediate a 'Non-Compliant' role detected by the previous custom AWS Config Rule.



## 1.2 Deployment

### 1.2.1 Quick Setup Patch Policy

The following steps have been taken from the documentation [here](https://docs.aws.amazon.com/systems-manager/latest/userguide/quick-setup-patch-manager.html) with modifications.

1. In the Management Account, open the AWS Systems Manager console at https://console.aws.amazon.com/systems-manager/.
2. In the navigation pane, choose **Quick Setup**.
3. On the **Patch Manager** card, choose **Create**.
4. For **Configuration name**, enter a name to help identify the patch policy.
5. In the **Scanning and installation** section, under **Patch operation**, choose whether the patch policy will **Scan** the specified targets or **Scan and install** patches on the specified targets.
6. Under **Scanning schedule**, choose **Use recommended defaults** or **Custom scan schedule**. The default scan schedule will scan your targets daily at 1:00 AM UTC.
7. If you chose **Scan and install**, choose the **Installation schedule** to use when installing patches to the specified targets. If you choose **Use recommended defaults**, Patch Manager will install weekly patches at 2:00 AM UTC on Sunday.
8. In the **Patch baseline** section, choose the patch baselines to use when scanning and updating your targets.
9. In the **Patching log storage** section, select **Write output to S3 bucket** to store patching operation logs in an Amazon S3 bucket.
10. Create a S3 bucket with SSE encryption. Choose **Browse S3** to select the bucket that will be used to configure output patching logs. Note: The bucket you select here is just to progress past the installation; it will be switched to another bucket in later steps.
11. In the Targets section, choose one of the following to identify the accounts and Regions for this patch policy operation.
    1.  Use **Target OUs** and specify OUs such as 'Dev', 'Test', 'Prod'
    2.  Use **Target Regions** and only select the needed regions (e.g. ca-central-1)
12. For **Choose how you want to target instances**, choose **All managed nodes**
13. In the **Rate control** section, leave the defaults or change as desired
14. **Unselect** the **Add required IAM policies to existing instance profiles attached to your instances** check box.
15. Choose **Create**


### 1.2.2 Modify the Quick Setup Target Account StackSet Template

Review the CloudFormation Stack Sets, and wait for the 'AWS-QuickSetup-PatchPolicy-TA-...' StackSet to fail.

1. Click on the 'AWS-QuickSetup-PatchPolicy-TA-...' StackSet, and click the **Template** tab.
2. Click the **Copy to clipboard** button
3. Paste the content into a text editor
4. Search for **RetentionInDays** properties on the 'AWS::Logs::LogGroup' resources. Remove all instances of this property and **Save** the file
5. Click on the 'AWS-QuickSetup-PatchPolicy-TA-...' StackSet, and click the **StackSet info** tab.
6. Copy & Paste all the ID's within the **Organziational unit IDs** to a text file, as this will be needed later.
7. From the **Actions** dropdown, choose **Edit StackSet details**
8. Click **Replace current template** and follow the steps to upload the modified saved template from step 4.
9.  Accept all defaults until **Step 2**, and update the following parameters:
   1.  **OutputS3BucketName** -> The Central Log Archive S3 bucket in the logging account. Example, "asea-logarchive-phase0-cacentral1-lgh04fj6ulma"
   2.  **OutputS3KeyPrefix** -> Enter "ssm-patching"
10. Accept all other defaults and progress until **Step 4 - Set deployment options**
11. The **Organizationl units (OU)** does not maintain the original values. Add each value that was copied in step 6.
12. Specify the same region(s) used in the original configuration (e.g. ca-central-1)
13. Accept all other defaults, and deploy the StackSet update

Review the CloudFormation Stack Sets, and wait for the 'AWS-QuickSetup-PatchPolicy-MA-...' StackSet to succeed.

1. Click on the 'AWS-QuickSetup-PatchPolicy-MA-...' StackSet, and from the **Actions** dropdown, choose **Edit StackSet details**
2. Accept all defaults until **Step 2**, and update the following parameters:
   1.  **OutputS3BucketName** -> The Central Log Archive S3 bucket in the logging account. Example, "asea-logarchive-phase0-cacentral1-lgh04fj6ulma"
   2.  **OutputS3KeyPrefix** -> Enter "ssm-patching"
3.  Accept all other defaults, and deploy the StackSet update

The StackSets should be successfully deployed, and you can return to the Quick Setup Patch Policy to see the dashboard showing Success.


### 1.2.3 ASEA Configuration file updates

> This section assumes v1.5.7 or greater as it includes the permission policy, ssm document, and custom config rule. Note that these can be manually uploaded to the config S3 bucket, and thus available to older ASEA versions. If applying to a previous version, make sure to copy the following files, found in the reference-artifacts folder, to your config S3 bucket: ``config-rules/ssm-patching-role-tags.zip``, ``iam-policy/ssm-patching-quick-setup-s3-permissions.txt``, and ``ssm-documents/ssm-patching-role-tagging.yaml``


1. Click on the 'AWS-QuickSetup-PatchPolicy-TA-...' StackSet, and click the **Parameters** tab.
2. Locate and record the value for the **QSConfigurationId**

3. Review the sample configuration file, **config.SSM-Patching-example**, found in **reference-artifacts/SAMPLE_CONFIGS/**

4. Compare the file to the sample, **config.example.json**

5. Note how the SSM Document is registered and refereced in target OUs. Adjust as needed.

6. Note how the new IAM Policy is applied to different Roles. Adjust as necessary.

7. Review and adjust the custom AWS Config Rule. The value record from step 1, is needed. Replace the **"*** REPLACE AFTER QUICK SETUP ***"** with the value. It should be a 5 characters alphanumeric string such as **vair8** or **rfnce**.

```
 {
    "name": "SSM-PATCHING-ROLE-TAGS",
    "type": "custom",
    "resource-types": ["AWS::IAM::Role"],
    "runtime": "nodejs18.x",
    "parameters": {
      "RoleNames": "EC2-Default-SSM-AD-Role, ${ACCELERATOR_PREFIX_ND}-RDGW-Role, ${ACCELERATOR_PREFIX_ND}-Rsyslog-Role",
      "QSConfigID": "*** REPLACE AFTER QUICK SETUP ***",
      "ResourceId": "RESOURCE_ID"
    },
    "remediation-action": "SSM-Patching-Role-Tagging",
    "remediation": true,
    "remediation-params": {
      "RoleId": "RESOURCE_ID",
      "QSConfigID": "*** REPLACE AFTER QUICK SETUP ***"
    }
}
```

8. Commit the changes to the Config file, and run the State Machine



### 1.2.4 Post Deployment Checks

After the State Machine has completed, log into a workload account within an OU where the solution was expected to be deployed.

1. Launch an EC2
   1. Name it **Test**
   2. Ensure that the **EC2-Default-SSM-AD-Role** is selected as the IAM Profile
2. Open the AWS Systems Manager console at https://console.aws.amazon.com/systems-manager/.
3. Click on the **Documents** link in the **Shared Resources** left navigation.
4. Click on the **Shared with me** tab, and confirm that **ASEA-SSM-Patching-Role-Tagging** exists.
5. Click on the **State Manager** link in the **Node Management** left navigation.
6. Monitor the AWS-QuickSetup-PatchPolicy-* Assocations. They should succeed once their scheduled time triggers the action. A common failed execution is the missing required tags on the IAM Role.
7. Open the AWS IAM console at https://console.aws.amazon.com/iam/ and navigate to Roles.
8. Find the **EC2-Default-SSM-AD-Role** role, and validate the the **SSM-Pathcing-S3-Policy** exists.
9. Review the **Tags** tab, and most likely there will only be 2. The custom AWS Config Rule hasn't triggered.
10. Open the AWS Config console at https://console.aws.amazon.com/config/
11. Click on **Rules** and search for **ASEA-SSM-PATCHING-ROLE-TAGS**. Inspect the rule and confirm that the **Remediation action** exists.