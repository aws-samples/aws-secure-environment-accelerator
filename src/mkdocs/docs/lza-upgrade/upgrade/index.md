# ASEA to LZA Upgrade

Before starting the upgrade process you need to make sure you recently went through all the preparation steps and have a copy of your LZA configurations files in the CodeCommit repository named `<prefix-name>-LZA-config`.

Re-confirm pre-requisites

- Confirm you are on the latest ASEA version and that the last state machine execution was successful.
- Confirm all suspended accounts are under a specific OU that is ignored by the accelerator. (see [Suspended accounts](../comparison/feature-specific-considerations.md#suspended-accounts))
- Confirm you don't have any empty nested OU without active AWS Accounts that are not referenced from the ASEA configuration files (i.e. `Dev/nestedOU`). The convert-config tool won't generate empty nested OUs in the configuration.

!!! warning
    The following steps will start applying changes to your environment by uninstalling ASEA and installing LZA. Only move ahead when ready to go through the full upgrade.

The upgrade steps are

- Upgrade
    1. [Optional preparation steps](./optional-steps.md)
    2. [Disable ASEA](./disable-asea.md)
    3. [Install LZA](./install-lza.md)
    4. [Finalize the upgrade](./finalize.md)