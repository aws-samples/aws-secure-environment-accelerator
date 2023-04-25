# 1. Accelerator Upgrade Guide

## 1.1. General Upgrade Considerations

-   Due to some breaking dependency issues, customers can only upgrade to v1.3.8 or above (older releases continue to function, but cannot be installed).
-   While an upgrade path is planned, customers with a standalone Accelerator installation can upgrade to v1.5.x but need to continue with a standalone installation until the Control Tower upgrade option becomes available.
-   Always compare your configuration file with the config file from the release you are upgrading to in order to validate new or changed parameters or changes in parameter types / formats.
    -   do NOT update to the latest firewall AMI - see the last bullet in section [1.8. Other Operational Considerations](./install.md#18-other-operational-considerations) of the installation guide
    -   do NOT update the `organization-admin-role` - see item 2 in section [1.3.7. Other](./install.md#137-other)
    -   do NOT update account-keys (i.e. existing installations cannot change the internal values to `management` from `master`)
    -   do NOT make changes outside those required for the upgrade (those stated in the release notes or found through the comparison with the sample config file(s)). Customers wishing to change existing Accelerator configuration should either do so before their upgrade, ensuring a clean/successful state machine execution, or after a successful upgrade.
-   The Accelerator name and prefix **_CANNOT_** be changed after the initial installation
-   Customers which customized any of the Accelerator provided default configuration files (SCPs, rsyslog config, ssm-documents, iam-policies, etc.) must manually merge the latest Accelerator provided updates with deployed customizations:
    -   it is important customers assess the new defaults and integrate them into their custom configuration, or Accelerator functionality could break or Accelerator deployed features may be unprotected from modification
    -   if customers don't take action, we continue to utilize the deployed customized files (without the latest updates)
-   The below release specific considerations need to be cumulatively applied (an upgrade from v1.2.3 to v1.2.5 requires you to follow both v1.2.4 and v1.2.5 considerations)

## 1.2. **Release Specific Upgrade Considerations:**

-   Upgrades to `v1.5.6-a and above` from `v1.5.5 and below`:
    -   In order to implement the VPC flow log fix ([#1112](https://github.com/aws-samples/aws-secure-environment-accelerator/pull/1112)) ([b5dc19c](https://github.com/aws-samples/aws-secure-environment-accelerator/commit/b5dc19cf1aa5917acb9e41a5fcf4a66b918893f6)):
        -   Before update: for every VPC of the configuration, change the “flow-logs” option to “CWL”
        -   Execute the State Machine using `{"scope": "FULL","mode": "APPLY"}`. Wait for successful completion
        -   Change the “flow-logs” option to the original value (“BOTH”) (don’t re-run the state machine)
        -   Follow the [general instructions](upgrades.md#13-summary-of-upgrade-steps-all-versions-except-v150) to upgrade ASEA  
-   Upgrades to `v1.5.1-a and above` from `v1.5.0` or `v1.5.1`:
    -   Do not add the parameter: `"ssm-inventory-collection": true` to OUs or accounts which already have SSM Inventory configured or the state machine will fail
    -   Follow the standard upgrade steps detailed in section 1.3 below
-   `v1.5.1` was replaced by v1.5.1-a and is no longer supported for new installs or upgrades
-   Upgrades to `v1.5.0` and `v1.5.1-a and above` from `v1.3.8 through v1.3.9`:
    -   We recommend upgrading directly to v1.5.1-a
    -   Due to the size and complexity of this upgrade, we require all customers to upgrade to `v1.3.8 or above` before beginning this upgrade
    -   While v1.5.0 supports Control Tower for _NEW_ installs, existing Accelerator customers _CANNOT_ add Control Tower to their existing installations at this time (planned enhancement for 22H1)
        -   Attempts to install Control Tower on top of the Accelerator will corrupt your environment (both Control Tower and the Accelerator need minor enhancements to enable)
    -   **The v1.5.x custom upgrade guide can be found [here](./v150-Upgrade.md)**
-   Upgrades to `v1.3.9 and above` from `v1.3.8-b and below`:
    -   All interface endpoints containing a period must be removed from the config.json file either before or during the upgrade process
        -   i.e. ecr.dkr, ecr.api, transfer.server, sagemaker.api, sagemaker.runtime in the full config.json example
        -   If you remove them on a pre-upgrade State Machine execution, you can put them back during the upgrade, if you remove them during the upgrade, you can put them back post upgrade.
-   Upgrades to `v1.3.3 and above` from `v1.3.2 and below`:

    -   Requires mandatory config file schema changes as documented in the [release notes](https://github.com/aws-samples/aws-secure-environment-accelerator/releases).
        -   These updates cause the config file change validation to fail and require running the state machine with the following input to override the validation checks on impacted fields: `{"scope": "FULL", "mode": "APPLY", "configOverrides": {"ov-ou-vpc": true, "ov-ou-subnet": true, "ov-acct-vpc": true }}`
        -   Tightens VPC interface endpoint security group permissions and enables customization. If you use VPC interface endpoints that requires ports/protocols other than TCP/443 (such as email-smtp), you must customize your config file as described [here](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/main/reference-artifacts/SAMPLE_CONFIGS/sample_snippets.md)

-   Upgrades from `v1.3.0 and below`:
    -   Please review the `Release Specific Upgrade Considerations` from ASEA v1.5.0 or below, they were removed from this release.

## 1.3. Summary of Upgrade Steps (all versions except [v1.5.0](./v150-Upgrade.md))

1. Login to your Organization Management (root) AWS account with administrative privileges
2. Either:
   a) Ensure a valid Github token is stored in secrets manager [(per the installation guide)](./install.md#142-create-github-personal-access-token-and-store-in-secrets-manager), or
   b) Ensure the latest release is in a valid branch of CodeCommit in the Organization Management account
3. Review and implement any relevant tasks noted in the General Upgrade Considerations [section](#11-general-upgrade-considerations) above
4. Update the config file in CodeCommit with new parameters and updated parameter types based on the version you are upgrading to (this is important as features are iterating rapidly)
    - An automated script is available to help convert config files to the new v1.5.0 format
    - Compare your running config file with the sample config file from the latest release
    - Review the `Config file changes` section of the [release notes](https://github.com/aws-samples/aws-secure-environment-accelerator/releases) for **all** Accelerator versions since your current deployed release
5. If you customized any of the other Accelerator default config files by overriding them in your S3 input bucket, merge the latest defaults with your customizations before beginning your upgrade
6. Download the latest installer template (`AcceleratorInstallerXYZ.template.json` or `AcceleratorInstallerXXX-CodeCommit.template.json`) from the `Assets` section of the latest [release](https://github.com/aws-samples/aws-secure-environment-accelerator/releases)
7. Do **_NOT_** accidentally select the `ASEA-InitialSetup` CloudFormation stack **below**
8. If you are replacing your GitHub Token:
    - Take note of the `AcceleratorName`, `AcceleratorPrefix`, `ConfigS3Bucket` and `NotificationEmail` values from the Parameters tab of your deployed Installer CloudFormation stack (`ASEA-what-you-provided`)
    - Delete the Installer CloudFormation stack (`ASEA-what-you-provided`)
    - Redeploy the Installer CloudFormation stack using the template downloaded in step 6, providing the values you just documented (changes to `AcceleratorName` or `AcceleratorPrefix` are not supported)
    - The pipeline will automatically run and trigger the upgraded state machine
9. If you are using a pre-existing GitHub token, or installing from CodeCommit:

    - Update the Installer CloudFormation stack using the template downloaded in step 5, updating the `GithubBranch` to the latest release (eg. `release/v1.5.1-a`)
        - Go to AWS CloudFormation and select the stack: `ASEA-what-you-provided`
        - Select Update, select Replace current template, Select Upload a template file
        - Select Choose File and select the template you downloaded in step 6 (`AcceleratorInstallerXYZ.template.json` or `AcceleratorInstallerXXX-CodeCommit.template.json`)
        - Select Next, Update `GithubBranch` parameter to `release/vX.Y.Z` where X.Y.Z represents the latest release
        - Click Next, Next, I acknowledge, Update
        - Wait for the CloudFormation stack to update (`Update_Complete` status) (Requires manual refresh)
    - Go To Code Pipeline and Release the ASEA-InstallerPipeline
