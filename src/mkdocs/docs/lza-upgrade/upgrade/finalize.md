
# Finalize the upgrade

!!! warning
    The following steps will delete ASEA resources that are no longer needed because they have been replaced by LZA resources. Please confirm that all resources are deployed and working as expected before proceeding with this step.

### Remove temporary Interface Endpoints for S3 and DynamoDB

If you created temporary Interface Endpoints for S3 and DynamoDB in the [optional preparation steps](./optional-steps.md#configure-interface-endpoints-for-s3-and-dynamodb) you can now remove them [according to the instructions](./optional-steps.md#removal-of-endpoints-after-the-lza-installation).


## Post upgrade Overview

This step will perform post upgrade actions which includes following

- Copy ASEA ACM Certificate assets from ASEA Central Bucket to LZA created Assets bucket. `copy-certificates`
- Delete Outputs from ASEA stacks. `remove-stack-outputs`
- Marks duplicate SNS Topics, Subscriptions and Policies for removal. `remove-sns-resources`
- Marks duplicate Config Rules and Remediation Configurations for removal. `remove-asea-config-rules`
- Marks duplicate RSyslog resources for removal. `remove-rsyslog`
- Marks duplicate CloudWatch Alarm resources for removal. `remove-cloudwatch-alarms`
- Marks duplicate CloudWatch Metrics resources for removal. `remove-cloudwatch-metrics`
- Marks duplicate Budget resources for removal. `remove-budgets`
- Marks duplicate logging resources for removal. `remove-logging`
- Marks duplicate CloudTrail configurations for removal. `remove-org-cloudtrail`

Each of the above steps has a corresponding flag that can be set during the post-migration step. These flags determine which actions are performed by the post-migration step.

## Post upgrade Commands

```bash
cd <root-dir>
yarn run post-migration remove-stack-outputs copy-certificates remove-sns-resources remove-asea-config-rules remove-cloudwatch-alarms remove-cloudwatch-metrics remove-budgets remove-logging remove-org-cloudtrail
```

After the commands has been run, go the the CodePipeline console and release the `ASEA-Pipeline`. Resources that have been flagged for removal will be deleted in the `ImportAseaResources` stage.

## Enabling Termination Protection on CloudFormation stacks

During the initial LZA installation, termination protection was set to false on CloudFormation stacks to facilitate troubleshooting and retries in case of errors. Now that LZA is installed we recommend that customers enable termination protection on all LZA stacks.

Change the setting in the `global-config.yaml` file and run the LZA pipeline.
```
terminationProtection: true
```

## Use of Opt-in regions

If you have AWS Opt-in regions, such as `ca-west-1` enabled in your landing zone, you should set the [enableOptInRegions](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/interfaces/___packages__aws_accelerator_config_lib_models_global_config.IGlobalConfig.html#enableOptInRegions) option by adding the following line in your `global-config.yaml` file. This will ensure the opt-in regions are automatically enabled when you create new accounts.

```
enableOptInRegions: true
```

## Upgrade complete

At this point the upgrade to LZA is complete. Further updates to the environment will require updating the LZA configuration and then executing the LZA pipeline.

Review the section [Feature specific considerations](../comparison/feature-specific-considerations.md) for further steps that may be needed based on your configuration.
