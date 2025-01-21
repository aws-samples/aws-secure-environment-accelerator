# Convert Configuration

## Convert Configuration Overview

In order to accomplish the upgrade, the existing ASEA configuration file needs to be converted into LZA configuration files (<https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/using-configuration-files.html>). The `convert-config` script parses through the ASEA configuration file and for each resource block does the following:

- Reads in the ASEA configuration object
- Decides the ASEA Object Type
- Maps object and resource metadata file to LZA Object
- Creates proper Deployment Targets for the LZA Object (This defines which accounts the resource will be deployed to)
- Once the entire ASEA configuration file has been converted, the output LZA configuration files will be stored locally in the current directory in a sub-directory named `outputs\lza-config`. The files will also be created in the CodeCommit repository name `<prefix-name>-LZA-config`

## Convert Configuration Commands

```bash
cd <root-dir>
yarn run convert-config
```

??? abstract "Option to generate files locally only"

    If you used the `local-update-only` in the [configuration step](../preparation/prereq-config.md#configuration), you should also use the `local-update-only` with the convert-config command to generate the files locally only as the CodeCommit repo wasn't created. This can be useful in your early preparation phase to validate the generated configuration without impacting your environment.

    ```bash
    yarn run convert-config local-update-only
    ```


??? abstract "Option to enable termination protection"

    By default the tool sets termination protection to false on CloudFormation stacks to facilitate troubleshooting and retries in case of errors. It is recommended to enable this feature through the LZA global configuration file after the initial LZA pipeline run is successful. The `enable-termination-protection` flag can be used to enable termination protection for the LZA deployed stacks in the initial installation.

    ```bash
    yarn run convert-config enable-termination-protection
    ```


!!! tip
    If an ASEA account resides in an Organizational Unit which is in the `ignored-ous` section of `global-config` block, that account will not be added to the resulting `accounts-config.yaml` output file. This is due to the way that the LZA handles accounts which it manages as well as logic in the config validator.

## Confirm Convert Configuration Outputs

After running the `convert-config` script, the following artifacts should be generated in the current directory in a subdirectory named `outputs/lza-config` and in the CodeCommit repository named `<prefix-name>-LZA-config`:

- Configuration Files
    - `accounts-config.yaml`
    - `global-config.yaml`
    - `iam-config.yaml`
    - `network-config.yaml`
    - `organization-config.yaml`
    - `security-config.yaml`
- Dynamic Partitioning preferences
    - `dynamic-partitioning/log-filters.json`
- IAM Policies
    - `iam-policies/*`
- Service Control Policies (SCPs)
    - `service-control-policies/*`
- SSM Documents
    - `ssm-documents/*`