# 1. State Machine Behavior and Inputs

## 1.1. State Machine Behavior

Accelerator v1.3.0 makes a significant change to the manner in which the state machine operates. These changes include:

1. Reducing the `default scope` of execution of the state machine to only target newly created AWS accounts and AWS accounts listed in the mandatory accounts section of the config file.
    - `default scope` refers to running the state machine without any input parameters;
    - This new default scope disallows any changes to the config file outside new accounts;
    - NOTE: it is critical that accounts for which others are dependant upon, MUST be located within the `mandatory-account-configs` section of the config file (i.e. management, log-archive, security, operations, shared-network, perimeter, etc.).
2. The state machine now accepts a new input parameter, `scope`, which accepts the following values: `FULL` | `NEW-ACCOUNTS` | `GLOBAL-OPTIONS` | `ACCOUNT` | `OU`.
    - when the `scope` parameter is supplied, you must also supply the `mode` parameter. At this time `mode` only accepts the value `APPLY`. To be specific `"mode":"APPLY"` is mandatory when running the state machine with the `"scope":` parameter.
3. Starting the state machine with `{"scope":"FULL","mode":"APPLY"}` makes the state machine execute as it did in v1.2.6 and below.
    - The state machine targets all AWS accounts and allows changes across any section of the config file;
    - The blocks and overrides described in section 1.4 above remain valid;
    - `FULL` mode must be run at least once immediately after any Accelerator version upgrade. Code Pipeline automatically starts the state machine with `{"scope":"FULL","mode":"APPLY"}`. If the state machine fails for any reason after upgrade, the state machine must be restarted with these parameters until a successful execution of the state machine has completed.
4. Starting the state machine with `{"scope":"NEW-ACCOUNTS","mode":"APPLY"}` is the same as operating the state machine with the `default scope` as described in the first bullet
5. Starting the state machine with `{"scope":"GLOBAL-OPTIONS","mode":"APPLY"}` restricts changes to the config file to the `global-options` section.
    - If any other portion of the config file was updated or changed, the state machine will fail;
    - The global options scope executes the state machine on the entire managed account footprint.
6. Starting the state machine with `{"scope":"OU","targetOus":[X],"mode":"APPLY"}` restricts changes to the config file to the specified `organizational-units` section(s) defined by `targetOus`.
    - When `scope=OU`, `targetOus` becomes a mandatory parameter;
    - `X` can be any one or more valid OU names, or the value `"ALL"`;
    - When `["ALL"]` is specified, the state machine targets all AWS accounts, but only allows changes to the `organizational-units` section of the config file;
    - When OUs are specified (i.e. `["Dev","Test"]`), the state machine only targets mandatory accounts plus accounts in the specified OUs (Dev, Test), and only allows changes to the specified OUs sections (Dev, Test) of the config file;
    - If any other portion of the config file was updated or changed, the state machine will fail.
7. Starting the state machine with `{"scope":"ACCOUNT","targetAccounts":[X],"mode":"APPLY"}` restricts changes to the config file to the specified `xxx-account-configs` section(s) defined by `targetAccounts`.
    - When `scope=ACCOUNT`, `targetAccounts` becomes a mandatory parameter;
    - `X` can be any one or more valid account numbers, the value `"NEW"`, or the value `"ALL"`;
    - When `["ALL"]` is specified, the state machine targets all AWS accounts, but only allows changes to the `xxx-account-configs` sections of the config file;
    - When specific accounts and/or `NEW` is specified (i.e. `["NEW", "123456789012", "234567890123"]`), the state machine only targets mandatory accounts plus the listed accounts and any newly created accounts. It also only allows changes to the specified accounts sections (New, 123456789012, 234567890123) of the config file;
    - If any other portion of the config file was updated or changed, the state machine will fail.

Starting in v1.3.0, we recommend running the state machine with the parameters that most tightly scope the state machines execution to your planned changes and minimizing the use of `FULL` scope execution.

-   should you accidentally change the wrong section of the config file, you will be protected;
-   as you grow and scale to hundreds or thousands of accounts, your state machine execution time will remain fast.

**NOTE 1:** The `scope` setting has no impact on SCP application, limit requests, custom tagging, or directory sharing.

**NOTE 2:** All comparisons for config file changes are assessed AFTER all replacements have been made. Changing variable names which result in the same end outcome do NOT appear as a change to the config file.

## 1.2. Accelerator State Machine Inputs

### 1.2.1. Rebuild DynamoDB table contents

With the exception of the Outputs table, the contents of the Accelerator DynamoDB tables are rebuilt on every state machine execution. We recently started depending on the Outputs DynamoDB tables to ensure the parameters in parameter store are consistently maintained in the same order as objects are created and deleted. Should the CONTENTS of the tables be destroyed or corrupted, customers can force a rebuild of the CloudFormation Outputs in DynamoDB by starting the state machine with the parameter:

```json
{ "storeAllOutputs": true }
```

This should be completed BEFORE running the state machine with a corrupt or empty DynamoDB table or the Accelerator is likely to reorder a customers parameters. If the DynamoDB tables were completely destroyed, they must be recreated before running the state machine with this parameter.

### 1.2.2. Bypass **ALL** config file validation checks

This parameter should be specified with extreme caution, as it bypasses all config file validation. The state machine typically has protections enabled preventing customers from making breaking changes to the config file. Under certain conditions with the support of a trained expert, bypassing these checks is required. Start the state machine with the parameter:

```json
{ "overrideComparison": true }
```

**_Customers are encouraged to use the specific override variables below, rather than the all-inclusive override, to ensure they only bypasses intended config changes._**

### 1.2.3. Bypassing SPECIFIC config file validation checks

Providing any one or more of the following flags will only override the specified check(s):

```json
{
    "configOverrides": {
        "ov-global-options": true,
        "ov-del-accts": true,
        "ov-ren-accts": true,
        "ov-acct-email": true,
        "ov-acct-ou": true,
        "ov-acct-vpc": true,
        "ov-acct-subnet": true,
        "ov-acct-vpc-optin": true,
        "ov-tgw": true,
        "ov-mad": true,
        "ov-ou-vpc": true,
        "ov-ou-subnet": true,
        "ov-share-to-ou": true,
        "ov-share-to-accounts": true,
        "ov-nacl": true,
        "ov-nfw": true
    }
}
```

### 1.2.4. Generate verbose logging within state machine

-   Added "verbose": "1" state machine input options
-   parameter is optional
-   parameter defaults to 0

```json
{ "scope": "FULL", "mode": "APPLY", "verbose": "1" }
```

### 1.2.5. State Machine scoping inputs

Summary of inputs, per section 1.1 above:

```json
{ "scope": "FULL", "mode": "APPLY" }
```

```json
{ "scope": "NEW-ACCOUNTS", "mode": "APPLY" }
```

```json
{ "scope": "GLOBAL-OPTIONS", "mode": "APPLY" }
```

```json
{ "scope": "OU", "targetOus": ["ou-name", "ou-name"], "mode": "APPLY" }
```

```json
{ "scope": "ACCOUNT", "targetAccounts": ["123456789012", "234567890123"], "mode": "APPLY" }
```

### 1.2.6. Example of combined inputs

```json
{
    "scope": "FULL",
    "mode": "APPLY",
    "configOverrides": { "ov-ou-vpc": true, "ov-ou-subnet": true, "ov-acct-vpc": true }
}
```
