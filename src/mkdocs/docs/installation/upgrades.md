# Upgrades

## Considerations

- Due to some breaking dependency issues, customers can only upgrade to v1.3.8 or above (older releases continue to function, but cannot be installed).
- While an upgrade path is planned, customers with a standalone Accelerator installation can upgrade to v1.5.0 but need to continue with a standalone installation until the Control Tower upgrade option becomes available.
- Always compare your configuration file with the config file from the release you are upgrading to in order to validate new or changed parameters or changes in parameter types / formats.
  - do NOT update to the latest firewall AMI - see the the last bullet in section [5.1. Accelerator Design Constraints / Decisions](#51-accelerator-design-constraints--decisions)
  - do NOT update the `organization-admin-role` - see bullet 2 in section [2.2.7. Other](#226-other)
  - do NOT update account-keys (i.e. existing installations cannot change the internal values to `management` from `master`)
  - do NOT make changes outside those required for the upgrade (those stated in the release notes or found through the comparison with the sample config file(s)). Customers wishing to change existing Accelerator configuration should either do so before their upgrade, ensuring a clean/successful state machine execution, or after a successful upgrade.
- The Accelerator name and prefix **_CANNOT_** be changed after the initial installation
- Customers which customized any of the Accelerator provided default configuration files (SCPs, rsyslog config, ssm-documents, iam-policies, etc.) must manually merge the latest Accelerator provided updates with deployed customizations:
  - it is important customers assess the new defaults and integrate them into their custom configuration, or Accelerator functionality could break or Accelerator deployed features may be unprotected from modification
  - if customers don't take action, we continue to utilize the deployed customized files (without the latest updates)
- The below release specific considerations need to be cumulatively applied (an upgrade from v1.2.3 to v1.2.5 requires you to follow both v1.2.4 and v1.2.5 considerations)

**Release Specific Upgrade Considerations:**

- Upgrades to `v1.5.0`:
  - Due to the size and complexity of this upgrade, we require all customers to upgrade to `v1.3.8 or above` before beginning this upgrade
  - While v1.5.0 supports Control Tower for _NEW_ installs, existing Accelerator customers _CANNOT_ add Control Tower to their existing installations at this time (planned enhancement for 22H1)
    - Attempts to install Control Tower on top of the Accelerator will corrupt your environment (both Control Tower and the Accelerator need minor enhancements to enable)
  - **The v1.5.0 custom upgrade guide can be found [here](./v150-Upgrade.md)**
- Upgrades to `v1.3.9 and above` from `v1.3.8-b and below`:
  - All interface endpoints containing a period must be removed from the config.json file either before or during the upgrade process
    - i.e. ecr.dkr, ecr.api, transfer.server, sagemaker.api, sagemaker.runtime in the full config.json example
    - If you remove them on a pre-upgrade State Machine execution, you can put them back during the upgrade, if you remove them during the upgrade, you can put them back post upgrade.
- Upgrades to `v1.3.3 and above` from `v1.3.2 and below`:
  - Requires mandatory config file schema changes as documented in the [release notes](https://github.com/aws-samples/aws-secure-environment-accelerator/releases).
    - These updates cause the config file change validation to fail and require running the state machine with the following input to override the validation checks on impacted fields: `{"scope": "FULL", "mode": "APPLY", "configOverrides": {"ov-ou-vpc": true, "ov-ou-subnet": true, "ov-acct-vpc": true }}`
    - Tightens VPC interface endpoint security group permissions and enables customization. If you use VPC interface endpoints that requires ports/protocols other than TCP/443 (such as email-smtp), you must customize your config file as described [here](/reference-artifacts/SAMPLE_CONFIGS/sample_snippets.md)
- Upgrades to `v1.3.0 and above` from `v1.2.6 and below`:
  - **Please note MAJOR changes to state machine behavior, as documented [here](./sm_inputs.md#11-state-machine-behavior)**.
- Upgrades to `v1.2.6 and above` from `v1.2.5 and below` - Ensure you apply the config file changes described in the release notes:
  - Cut-paste the new `"replacements": {},` section at the top of the example config file into your config file, as-is
    - Enables customers to leverage the repo provided SCP's without customization, simplifying upgrades, while allowing SCP region customization
    - the cloud-cidrX/cloud-maskX variables are examples of customer provided values that can be used to consistently auto-replace values throughout config files, these 4 specific variables are **_all_** required for the firewalls to successfully deploy
  - The new ${variable} are auto-replaced across your config files, SCP's and firewall config files.
    - as the variables should resolve to their existing values, you can leave your config file using hardcoded region and Accelerator prefix naming, or you can update them to make subsequent file comparisons easier for future upgrades. These are most useful for new installations in non ca-central-1 regions
  - Some repo provide filenames have changed, where they are referenced within the config file, you must update them to their new filenames
  - We do not delete/cleanup old/unused SCP's, in case they were also used by customers for unmanaged OUs or sub-ou's. After the upgrade, you should manually delete any old/extra SCP's which are no longer required
- Upgrades to `v1.2.5 and above` from `v1.2.4 and below` requires the manual removal of the `PBMMAccel-PipelineRole` StackSet before beginning your upgrade (we have eliminated all use of StackSets in this release)
  - In the root AWS account, go to: CloudFormation, StackSets
  - Find: `ASEA-PipelineRole`, and Select the: `Stack Instances` tab
  - Document all the account numbers, comma separated i.e. 123456789012, 234567890123, 345678901234
  - Select: Actions, Delete Stacks from StackSets
  - Paste the above account numbers (comma separated) in the Account numbers box
  - Select the Accelerator installation/home region from the Specify Regions Box (should be the only region in the dropdown)
  - Change: Concurrency to: 8, Next, Submit
  - Wait for operation to complete (refresh the browser several times)
  - Select Actions, Delete StackSet, click Delete StackSet
  - Wait for the operation to complete
- Upgrades to `v1.2.4 and above` from `v1.2.3 and below` - Ensure you apply the config file changes described in the release notes:
  - failure to set `"central-endpoint": true` directly on the endpoint VPC (instead of in global-options), will result in the removal of your VPC endpoints
  - failure to move your zone definitions to the endpoint VPC, will result in the removal of you Public and Private hosted zones

## Summary of Upgrade Steps (all versions)

1. Login to your Organization Management (root) AWS account with administrative privileges
2. Either:
   a) Ensure a valid Github token is stored in secrets manager [(section 2.3.2)](#232-create-github-personal-access-token-and-store-in-secrets-manager)
   b) Ensure the latest release is in a valid branch of CodeCommit in the Organization Management account
3. Review and implement any relevant tasks noted in the upgrade considerations in [section 3.1](#31-considerations)
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

- Update the Installer CloudFormation stack using the template downloaded in step 5, updating the `GithubBranch` to the latest release (eg. `release/v1.5.0`)
  - Go to AWS CloudFormation and select the stack: `ASEA-what-you-provided`
  - Select Update, select Replace current template, Select Upload a template file
  - Select Choose File and select the template you downloaded in step 6 (`AcceleratorInstallerXYZ.template.json` or `AcceleratorInstallerXXX-CodeCommit.template.json`)
  - Select Next, Update `GithubBranch` parameter to `release/vX.Y.Z` where X.Y.Z represents the latest release
  - Click Next, Next, I acknowledge, Update
  - Wait for the CloudFormation stack to update (`Update_Complete` status) (Requires manual refresh)
- Go To Code Pipeline and Release the ASEA-InstallerPipeline
