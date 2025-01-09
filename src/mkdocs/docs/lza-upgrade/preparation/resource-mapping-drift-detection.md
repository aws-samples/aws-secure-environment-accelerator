# Resource Mapping and Drift Detection Scripts

!!! warning
    When ready to apply the upgrade you will need to re-run the resource mapping. Or if you make changes to ASEA resources to fix drifted resources.

### Overview

The Resource Mapping script will generate the ASEA mapping file which will be used throughout the ASEA to LZA Upgrade process. In order to accomplish this task, the script needs to do the following:

- Ensure that the S3 Bucket exists and has proper object versioning enabled
- Retrieve all ASEA Enabled Regions from the ASEA Configuration File.
- Retrieve all ASEA Enabled Accounts from the ASEA Parameters Table.
- Assume a role into each account and create a unique AWS CloudFormation client for each environment (region/account combination). For each unique environment:
    - List every CloudFormation Template associated with ASEA (This is a filtered down list operation)
    - List every Resource that is associated with the CloudFormation Template.
    - Detect Drift on each individual resource
- The outputs of these will be saved in the S3 Bucket.

### Resource Mapping Commands

```bash
cd <root-dir>
yarn run resource-mapping
```

### Confirm Resource Mapping Outputs

After running the `resource-mapping` script, the following artifacts should be generated inside the S3 bucket which has been deployed via CloudFormation and passed in the config file as `mappingBucketName`.

- Drift Detection File (per account/per region/per stack)
- Stack Resource File (per account/per region/per stack)
- Aggregate Drift Detection File (All drifted resources)

The file `AllDriftDetectedResources.csv` contains an aggregate of resources that have drifted from their original configuration. Review the next section of this guide to [analyze and handle the drift results](./drift-handling.md)

In order to validate the output artifacts, you should verify that the following files have been created inside the S3 Bucket (_*Output-Mapping-Bucket*_).

??? abstract "Detailed information for drift files"

    - Resource Mapping File
        - Look for file which matches _*Output-Mapping-File-Name*_ from configuration file.
    - Aggregated Drift Detection File
        - Look for a file named `AllDriftDetectedResources.csv`
        - See [Further instructions on analyzing the drift results](./drift-handling.md)
    - Drift Detection Files
        - For a more granular look at Drift Detection, this is available on an account/region/stack basis as well:
            - Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-drift-detection.csv`
            - See [Further instructions on analyzing the drift results](./drift-handling.md)
    - Stack Resource List Output
        - For each Account, Region, and Stack:
            - Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-resources.csv`


### Custom Resource Drift Detection

#### Custom Resource Drift Detection Overview

The above section covers Drift Detection on CloudFormation native resources. However, ASEA and LZA both utilize many Lambda-backed custom-resources as well. To successfully detect drift during the upgrade process, there is a snapshot tool that records the state of custom resources.
The snapshot tool supports the following commands:

- yarn run snapshot pre
- yarn run snapshot post
- yarn run snapshot report
- yarn run snapshot reset

Snapshots will be taken before the upgrade to collect information that will be available for future troubleshooting. Optionnaly you can capture the snapshot after the upgrade as well.

??? abstract "Detailed information about snapshot commands"

    Each subcommand of the snapshot tool and its associated actions can be found below:

    - `yarn run snapshot pre` - This command should be run `before` the upgrade process. Describes all custom resource states before the upgrade and saves the results in `${aseaPrefix}-config-snapshot`
    - `yarn run snapshot post` - This command should be run `after` the upgrade process. Describes all custom resource states after the upgrade and saves the results in `${aseaPrefix}-config-snapshot`
    - `yarn run snapshot report` - This command should be run `after` the pre and post snapshot commands have been run. Runs a diff on the Pre and Post snapshot resources and outputs a list of the diffs.
    - `yarn run snapshot reset` - Deletes the DynamoDB table `${aseaPrefix}-config-snapshot`

    In order to do this, the tool does the following:

    - Creates DynamoDB table in the `${homeRegion}` to store snapshot data. The table is named `${aseaPrefix}-config-snapshot`:
    - Assume a role into each account and makes AWS api calls to describe the state of each service managed by a custom resources. In each account/region:
        - For each custom resource type, retrieve associated AWS resource, attributes, and state
    - The data will then be stored in the DynamoDB table with the following fields:
        - `AccountRegion` - `${AccountKey}:${Region}` key to identify what account and region the resource lives in
        - `ResourceName` - Custom Resource Id
        - `PreMigrationJson` (Created after snapshot pre) - This field contains the metadata and state of the resource(s) associated with the Custom Resource prior to the upgrade.
        - `PreMigrationHash` (Created after snapshot pre) - This field contains a hashed value of the pre-upgrade json.
        - `PostMigrationJson` (Created after snapshot post) - This field contains the metadata and state of the resource(s) associated with the Custom Resource after the upgrade is complete.
        - `PostMigrationHash` (Created after snapshot post) - This field contains a hashed value of the post-upgrade json.


#### Custom Resource Drift Detection Commands

```bash
cd <root-dir>
yarn run snapshot pre
```

??? abstract "Custom Resource Drift Detection Outputs"

    In order to validate the snapshot behaviors, you will need to do the following:

    - Navigate to `DynamoDB` in the AWS console.
    - Click on `Tables` on the left side of the page.
    - On the `Tables` page, select the radio-button next to the table `${aseaPrefix}-config-snapshot`
    - Once you have selected the radio-button, click on the `Explore Table Items` button in the top right.
    - This table should be populated with the following fields:
        - AccountRegion
        - ResourceName
        - PreMigrationJson
        - PreMigrationHash
