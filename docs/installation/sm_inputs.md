# 1. Accelerator State Machine Inputs

## 1.1. Rebuild DynamoDB table contents

With the exception of the Outputs table, the contents of the Accelerator DynamoDB tables are rebuilt on every state machine execution. We recently started depending on the Outputs DynamoDB tables to ensure the parameters in parameter store are consistently maintained in the same order as objects are created and deleted. Should the CONTENTS of the tables be destroyed or corrupted, customers can force a rebuild of the CloudFormation Outputs in DynamoDB by starting the state machine with the parameter:

```
{ "storeAllOutputs": true }
```

This should be completed BEFORE running the state machine with a corrupt or empty DynamoDB table or the Accelerator is likely to reorder a customers parameters. If the DynamoDB tables were completely destroyed, they must be recreated before running the state machine with this parameter.

## 1.2. Bypass **ALL** config file validation checks

This parameter should be specified with extreme caution, as it bypasses all config file validation. The state machine typically has protections enabled preventing customers from making breaking changes to the config file. Under certain conditions with the support of a trained expert, bypassing these checks is required. Start the state machine with the parameter:

```
{ "overrideComparison": true }
```

**_Customers are encouraged to use the specific overide variables below, rather than the all-inclusive overide, to ensure they only bypasses intended config changes._**

## 1.3. Bypassing SPECIFIC config file validation checks

Providing any one or more of the following flags will only overide the specified check(s):

```
 {
   "configOverrides": {
     'ov-global-options': true,
     'ov-del-accts': true,
     'ov-ren-accts': true,
     'ov-acct-email': true,
     'ov-acct-ou': true,
     'ov-acct-vpc': true,
     'ov-acct-subnet': true,
     'ov-tgw': true,
     'ov-mad': true,
     'ov-ou-vpc': true,
     'ov-ou-subnet': true,
     'ov-share-to-ou': true,
     'ov-share-to-accounts': true,
     'ov-nacl': true
	}
 }
```

---

[...Return to Accelerator Table of Contents](../index.md)
