# 1. Accelerator v1.5.x Custom Upgrade Instructions

## 1.1. Overview

The upgrade from v1.3.8/v1.3.9 to v1.5.x is generally the same as any previous Accelerator upgrades, with a couple of key differences:

-   the magnitude of this release has resulted in a requirement for significant updates to the config file
    -   we have provided a script to _assist_ with this process. A manual verification of the changes and customer custom updates are often still required.
-   we are re-aligning the OU structure with AWS guidance and that of AWS Control Tower (optional, but highly recommended)
    -   the core OU is being split into a "Security" OU and an "Infrastructure" OU
-   we've added the capability to manage your IP addresses in DynamoDB, rather than with the config file
    -   this includes the ability to dynamically allocate CIDR ranges to VPCs and subnets
    -   more information on this features design can be found on this [ticket](https://github.com/aws-samples/aws-secure-environment-accelerator/issues/494)
    -   the config file conversion script will:
        -   update your config file in a manner that supports both CIDR management schemes (but continues to leverage the previous mechanism)
        -   copy your currently configured CIDR ranges into the appropriate DynamoDB tables (optional, but recommended)
    -   you can change your IP address mechanism for any VPC at any time
    -   customers can mix and match IP address management mechanisms as they choose (`provided`, `lookup`, and `dynamic`)

## 1.2. Upgrade Caveats

1. **While an upgrade path is planned, customers with a Standalone Accelerator installation can upgrade to v1.5.x but need to continue with a Standalone installation until the Control Tower upgrade option becomes available.**

2. The script to assist with config file conversion and DynamoDB population only supports single file json based config files, customers that leverage YAML and/or multi-part config files, have several options:

    - manually update your yaml or multi-part json config file to reflect the config file format for the latest release (similar to all previous upgrades)
    - use the config.json file found in the `raw` folder of your CodeCommit repo to run the conversion script
        - this version of the config file has resolved all variables with their final values, all variables will be removed from config.json in this scenario
        - the new config file can be converted back to json/multi-part format before being placed back into your CodeCommit repository
        - or it could be used to simply validate the changes you made using option a
        - do not manually update the config file in the `raw` folder, as it will be overwritten based on the json or yaml file in the root of your repository
    - use a 3rd party tool to manually convert your yaml / multi-part config files to a single file json file to run the conversion script
        - the new config file can be converted back to json/multi-part format before being placed back into your CodeCommit repository

3. Config files which are significantly different than the example config files may not be properly converted. This includes config files which use different mandatory account keys or renamed the core OU.
4. This guide and its examples assume the existing accelerator deployment uses the `PBMMAccel-` accelerator prefix, if a different prefix is used on the existing installation, it is important it is specified when execution section 1.6 below.

## 1.3. Config File Conversion

-   You must first upgrade to Accelerator v1.3.8 or v1.3.9
-   Login to your AWS Organization Management account
-   Pull your current config.json file from CodeCommit and save as a text file
-   Locate the python conversion script and review its readme [here](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/main/reference-artifacts/Custom-Scripts/Update-Scripts/v1.3.8_to_v1.5.0)

    -   To convert your configuration file execute: (completely offline process)

    `python update.py --Region ca-central-1 --LoadConfig --ConfigFile config.json`

    -   This will output a new config file named: `update-config.json`
    -   Save _both_ the original v13.8 and the new v1.5.0 config files for future reference/use
    -   After conversion, we recommend running the updated config file back prettier to simplify file comparisons

-   While the conversion script often does much of the heavy lifting, we still require customers to manually verify the changes and make manual adjustments as appropriate:

    -   If you use a relatively standard config file you MAY not need to make any changes manually
    -   Ensure the value of `account-name` for the Organization Management account matches the actual account name of the Organization management account (the account key is generally either `management` or `master`).

    -   we recommend you change your `rdgw-instance-type` and `rsyslog-instance-type` from t2._to t3._ (they will auto-replace on the next instance refresh) (Optional).
    -   optionally remove the `"API_GW_EXECUTION_LOGGING_ENABLED"` config rule throughout, as it overlaps with an identical Security Hub config rule.
    -   we added the capability to deploy a Config aggregator in any of the central services accounts (i.e. Log-archive, Security, Operations), by adding `"config-aggr": true` to _either_: `central-security-services`, `central-operations-services`, or `central-log-services`. The existing aggregator in the Org management account will remain. Do **not** set it in all 3 sections, as AWS only supports a maximum of 3 config aggregators.
    -   the optional attribute `endpoint-port-orverides` has been properly renamed to `endpoint-port-overrides`. If you have the `endpoint-port-orverides` in your config file you must rename it to `endpoint-port-overrides`.
    -   the new example config files also introduced several new internally resolvable variables (`${CONFIG::OU_NAME}` and `${CONFIG::VPC_NAME}`), which when used thoughtfully along with the new dynamic CIDR feature, enables multi-part config file customers to define the VPCs for multiple OU's in a single shared nested config file. These new variables should be ignored during an upgrade.
    -   the accelerator supports 3 types of CIDR ranges `provided`, `lookup`, and `dynamic`. The upgrade script sets the `cidr-src` to `provided`, meaning it uses the CIDR ranges provided in the config file, as per the previous release. The upgrade script also adds the additional required fields (`pool` and `size`) to every CIDR range defined in the config file to leverage the `lookup` type, but when set to `provided` these fields are NOT required and could be removed. They were added by the script for the sole purpose of making it easy to switch from `provided` to `lookup` in future. Once a customer switches to `lookup`, the `cidr\value` field is no longer used and can be removed from the config file. The `cidr-src` for should remain set at `provided` during upgrade.
    -   do **not** add the `cidr-pools` section to the config file during or before the upgrade, this section is only used for new installations.
    -   New description fields have been added to the config file to help provide context to certain objects. These will be used by a future GUI that is under development, and serve no functional purpose at this time. Customers can alter this text as they please.
    -   Most of the example config files have been converted to `dynamic` cidr-src as it provides simplier CIDR management for new customers. Two example config files ending in `-oldIP.json` have been maintained to aid upgrading customers in config file comparison.
    -   Be advised - in v1.5.0 we restructured the SCPs based on a) customer requests, and b) the addition of Control Tower support for new installs.
        -   customers are responsible for reviewing the SCPs to ensure they have not been altered in a manner that no longer meets an organizations security requirements;
        -   we reorganized and optimized our SCP's from 4 SCP files down to 3 SCP files, without removing any protections or guardrails;
        -   these optimizations have resulted in minor enhancements to the SCP protections and in some cases better scoping;
        -   the first two SCP files (Part-0 and Part-1) contain the controls which protect the integrity of the Accelerator itself;
        -   the third file (Sensitive, Unclass, Sandbox) contains customer data protection specific guardrails, which may change based on workload data classification or customer profiles and requirements;
        -   this frees the fourth SCP for use by Control Tower, or for use by customers for custom guardrails (Standalone installs only). As Control Tower leverages 2 SCP files on the Security OU, we have moved some of our SCP's to the account level (Control Tower installations only).
    -   The script and upgrade instructions above do not include the new config file parameters added in v1.5.1+. These new parameters can be added either during or after the upgrade. New parameters include: `"rdgw-enforce-imdsv2": true`, `"rsyslog-enforce-imdsv2": true`, `"ssm-inventory-collection": true` on each ou, and `"dynamic-s3-log-partitioning": [{values}]`

## 1.4. Upgrade process

-   Before proceeding with your upgrade please review the General and Release Specific Upgrade Considerations in the [Upgrade Guide](./upgrades.md)
    -   upgrades directly from v1.3.8 need to ensure they include the extra step required for v1.3.9 upgrades (removal of endpoints with periods)
-   Login to your AWS Organization Management account, in your home or default region
-   Place your _updated and validated_ config file back in the root folder of your CodeCommit repository
    -   json, yaml and multi-part config files continue to be supported
-   Change to the us-east-1 region and open CloudWatch
    -   Select Rules under events in the left navigation pane
    -   Select the `PBMMAccel-MoveAccount_rule`, select `actions`, select `Disable`
    -   Select the `PBMMAccel-PolicyChanges_rule`, select `actions`, select `Disable`
-   Open AWS Organizations
    -   Select the `core` OU and rename it to `Security` (case sensitive) (i.e. Actions, Rename)
    -   In the `Root` ou, create a new OU named `Infrastructure (case sensitive) (i.e. Actions, Create new)
    -   Expand the `Security` OU, select all EXCEPT the `security`, `log-archive`, and Organization `Management` account
        -   (i.e. the `Operations`, `Perimeter`, and `SharedNetwork` accounts)
    -   Select Actions, Move, then select the newly created `Infrastructure` OU (note these accounts temporarily missing guardrails)
        -   NOTE: the key to this being a possible move/change, is the new `Infrastructure` OU is defined identically to the old `core` OU. Typically you CANNOT move accounts between OU's without breaking something and violating security guardrails.
    -   Select Policies from the left navigation pane, then Service COntrol Policies
        -   Click the `PBMMAccel-Guardrails-Part-2` policy, and Select Targets
        -   Detach the policy from ALL OUs
-   Change to the us-east-1 region and open CloudWatch
    -   Select Rules under events in the left navigation pane
    -   Select the `PBMMAccel-MoveAccount_rule`, select `actions`, select `Enable`
    -   Select the `PBMMAccel-PolicyChanges_rule`, select `actions`, select `Enable`
-   Follow the Standard Upgrade instructions from the section `Summary of Upgrade Steps (all versions)` of the Installation and Upgrade guide, repeated verbatim below for ease of reference

## 1.5. "Summary of Upgrade Steps (all versions)" **_(Copied from upgrade guide)_**

1. Login to your Organization Management (root) AWS account with administrative privileges
2. Either:

    a) Ensure a valid Github token is stored in secrets manager, or

    b) Ensure the latest release is in a valid branch of CodeCommit in the Organization Management account. See this [(section)](./install.md#142-create-github-personal-access-token-and-store-in-secrets-manager) of the installation guide for more details.

3. Review and implement any relevant tasks noted in the upgrade consideration sections (sections 1.1 and 1.2) of the [Upgrade Guide](./upgrades.md)
4. Update the config file in CodeCommit with new parameters and updated parameter types based on the version you are upgrading to (this is important as features are iterating rapidly)
    - An automated script is available to help convert config files to the new v1.5.0 format
    - Compare your running config file with the sample config file from the latest release
    - Review the `Config file changes` section of the [release notes](https://github.com/aws-samples/aws-secure-environment-accelerator/releases) for **all** Accelerator versions since your current deployed release
5. If you customized any of the other Accelerator default config files by overriding them in your S3 input bucket, merge the latest defaults with your customizations before beginning your upgrade
6. Download the latest installer template (`AcceleratorInstallerXYZ.template.json` or `AcceleratorInstallerXXX-CodeCommit.template.json`) from the `Assets` section of the latest [release](https://github.com/aws-samples/aws-secure-environment-accelerator/releases)
7. Do **_NOT_** accidentally select the `PBMMAccel-InitialSetup` CloudFormation stack **below**
8. If you are replacing your GitHub Token:
    - Take note of the `AcceleratorName`, `AcceleratorPrefix`, `ConfigS3Bucket` and `NotificationEmail` values from the Parameters tab of your deployed Installer CloudFormation stack (`PBMMAccel-what-you-provided`)
    - Delete the Installer CloudFormation stack (`PBMMAccel-what-you-provided`)
    - Redeploy the Installer CloudFormation stack using the template downloaded in step 6, providing the values you just documented (changes to `AcceleratorName` or `AcceleratorPrefix` are not supported)
    - The pipeline will automatically run and trigger the upgraded state machine
9. If you are using a pre-existing GitHub token, or installing from CodeCommit:

    - Update the Installer CloudFormation stack using the template downloaded in step 5, updating the `GithubBranch` to the latest release (eg. `release/v1.5.0`)
        - Go to AWS CloudFormation and select the stack: `PBMMAccel-what-you-provided`
        - Select Update, select Replace current template, Select Upload a template file
        - Select Choose File and select the template you downloaded in step 6 (`AcceleratorInstallerXYZ.template.json` or `AcceleratorInstallerXXX-CodeCommit.template.json`)
        - Select Next, Update `GithubBranch` parameter to `release/vX.Y.Z` where X.Y.Z represents the latest release
        - Click Next, Next, I acknowledge, Update
        - Wait for the CloudFormation stack to update (`Update_Complete` status) (Requires manual refresh)
    - Go To Code Pipeline and Release the PBMMAccel-InstallerPipeline

## 1.6. Post Upgrade Follow-up Tasks for v1.5.x Upgrade

-   Once the State Machine finishes in AWS Organizations, delete the `PBMMAccel-Guardrails-Part-2` SCP, as we do not remove policies from Organizations given they could be used by customers for other purposes.
-   Optionally, populate DynamoDB with your allocated CIDR ranges:

    -   You _must_ perform the following steps if you plan to:
        -   move from `"cidr-src": "provided"` to `"cidr-src": "lookup"` for your existing cidr blocks; or
        -   dynamically assign CIDR ranges to new VPCs using pools that overlap with existing VPC's currently defined in your config file.
    -   this step populates the DynamoDB tables (`PBMMAccel-cidr-vpc-assign` and `PBMMAccel-cidr-subnet-assign`) with your EXISTING utilized CIDR ranges using the upgrade script a second time _after_ the upgrade is complete.
    -   Using the converted version of your config file (update-config.json)

        -   Validate you are happy with the `pool` names assigned to each VPC and subnet throughout the config file. Update as appropriate, pool names can be any alpha-numeric string, but a subnets pool must match one of its VPCs pools.
        -   Locate the python conversion script and review its readme [here](https://github.com/aws-samples/aws-secure-environment-accelerator/tree/main/reference-artifacts/Custom-Scripts/Update-Scripts/v1.3.8_to_v1.5.0)
        -   To load DynamoDB with your CIDR ranges, execute: (online, requires credentials to the Organization Management account)

        `python update.py --Region ca-central-1 --LoadDB --ConfigFile update-config.json --AcceleratorPrefix PBMMAccel-`

        -   Note the use of the --LoadDB switch, the UPDATED config filename, and that the Accelerator prefix is specified
            -   If you run this command using your v1.3.8 or v1.3.9 config file, the `\cidr\pool:` values will be improperly assigned in DynamoDB.
        -   In the Organization Management account, in DynamoDB, select Items, and Verify that the tables have been properly populated.
            -   the script should have populated the following two DynamoDB tables: `PBMMAccel-cidr-vpc-assign` and `PBMMAccel-cidr-subnet-assign` with all your existing vpc and subnet assignments.

    -   if you plan to dynamically assign CIDR ranges for any new VPCs, you need to manually create the CIDR pools by adding new item(s) to the DynamoDB Table `PBMMAccel-cidr-pool`. The `PBMMAccel-cidr-pool` table stores CIDR ranges to select from for new CIDR assignments. This table works together with the other two DynamoDB tables to track, assign and maintain non-overlapping CIDR ranges based on a pool name and region.

<details><summary>Sample DynamoDB JSON to add an entry to the `PBMMAccel-cidr-pool` table:</summary>

```json
{
    "id": {
        "S": "1"
    },
    "cidr": {
        "S": "10.0.0.0/13"
    },
    "region": {
        "S": "ca-central-1"
    },
    "pool": {
        "S": "main"
    }
}
```

    - where `id` is any unique text, `cidr` is the main cidr block from which VPC cidrs are taken. `region` is the AWS region where the pool is used. `pool` is the name of the pool

</details>

NOTES:

-   You can populate the `cidr-pools` section of the config file/DynamoDB with values that overlap with the existing assigned ranges in your config file. In this situation, it is CRITICAL that you execute this entire process, to avoid issueing duplicate or overlapping CIDR ranges with those already issued. Alternatively, leverage new unique ranges when populating the `cidr-pools`.
-   `cidr-pools` only needs to be populated when a VPC has a `cidr-src` set to `dynamic`.
-   Optionally, change all the `cidr-src` values throughout your config file to `lookup`, and remove all the `cidr\value` fields. Once changed, CIDR values will be provided by DynamoDB. Switching to `lookup` requires completion of the previous optional step to first load DynamoDB.
    -   run the state machine with the input parameters `{"scope": "FULL","mode": "APPLY","verbose": "0"}`
    -   during the state machine execution, the Accelerator will compare the values returned by DynamoDB with the values from the previous successful state machine execution. If the DynamoDB values were incorrectly populated, the state machine will catch it with a comparison failure message and gracefully fail.
