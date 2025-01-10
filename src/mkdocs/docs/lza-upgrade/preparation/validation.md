# Pre-upgrade validations

The Landing Zone Accelerator has tools that can be used to validate the configuration locally. This can help catch errors locally before applying the upgrade in the actual AWS environment.

## Obtain and build the Landing Zone Accelerator code
To run those tools you need to download and build the [Landing Zone Accelerator code](https://github.com/awslabs/landing-zone-accelerator-on-aws).

The following commands should be run in a dedicated folder, outside of the current folder with the upgrade scripts, to store the LZA code base (referred as `<lza-code>` in instructions)
```
cd <lza-code>
git clone https://github.com/awslabs/landing-zone-accelerator-on-aws/
cd source
yarn install
yarn build
```

To run the next commands you need to confirm you have valid temporary credentials to your management account as mentioned at the [beginning of this guide](./prereq-config.md#retrieve-temporary-iam-credentials-via-aws-identity-center).

## Validating LZA configuration files

LZA has a tool to validate your configuration files. We strongly recommend you run this tool on the generated LZA configuration file to spot any errors.

See [Configuration Validator](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#configuration-validator) section in the LZA developer guide for more details.

To run the configuration validation, run the following commands from the LZA source directory by passing the path to the LZA config file as an argument.

```
cd <lza-code>/source
yarn validate-config <root-dir>/outputs/lza-config
```

## Validate Service Control Policies size

The upgrade to LZA generally does not modify your current SCP statements. The only exception is that the `organization-admin-role` can be added to the `SSM` and `S3` statements of the `Guardrails-Part-0` and `Guardrails-Part-1` SCPs if it is not already there. This can potentially bring those SCP over the limit if the existing content was close to the limit.

We recommend that you verify the number of characters of all SCP files to confirm they are not over the 5120 characters limit. You can run the following command from within the `outputs/lza-config` folder to print the size of each SCP file.

```
for FILE in service-control-policies/*; do echo -n $FILE; echo -n ' '; cat $FILE | sed -e 's/[[:space:]]//g' |  tr -d '\r' | tr -d '\n' | wc -c; done
```

## Validation complete
You have successfully validated the configuration and the preparation steps.

!!! warning
    Stop here if you are not ready to proceed with the ASEA to LZA upgrade. Otherwise move to the next section to start the upgrade.