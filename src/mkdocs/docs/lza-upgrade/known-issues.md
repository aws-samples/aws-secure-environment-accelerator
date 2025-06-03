# Known Issues

This is a list of known issues at the time of release, this list will be updated when new versions of the upgrade tools are released. Contact your AWS account teams for more details if these issues impact your upgrade.

## Unsupported configurations
The following configurations are not handled automatically by the current version of the upgrade tools. Also review the [Feature-specific considerations](./comparison/feature-specific-considerations.m) section of the documentation for additional details.

### Site-to-site VPNs

**Description:** Site-to-site VPNs attached to Transit Gateway configured with ASEA are not converted to LZA configuration.

**Symptom or error message:** The customer gateway and VPN connections configurations are not generated in the LZA `network-config.yaml` file.

**Resolution or workaround:** While the configurations are not present in the LZA configuration files, the already deployed resources won't be affected during the upgrade. Thus the VPN connection will still be in place and no network disruption on the VPN tunnel is anticipated during the upgrade. After the upgrade you can plan deploying new VPN configurations natively using LZA and delete the original resources created by ASEA.


## Upgrade known issues
The following issues can result in errors during the ASEA to LZA upgrade and should be fixed in the LZA configuration files before starting the LZA installation.

### Error: Transit Gateway static route already exist

**Description:** During LZA install, LZA attempts to re-create a transit gateway static route table entry that already exists.

**Symptom or error message:** Error in the NetworkAssociationsStack during LZA initial installation.

```
ASEA-NetworkAssociationsStack-xxxxxx-ca-central-1 failed: Error: The stack named ASEA-NetworkAssociationsStack-xxxxxx-ca-central-1 failed creation, it may need to be manually deleted from the AWS console: ROLLBACK_COMPLETE: tgw-rtb-xxxxx|x.x.x.x/yy already exists in stack arn:aws:cloudformation:ca-central-1:xxxxxxx:stack/ASEA-SharedNetwork-Phase2
```

**Root cause**: The static route was deployed in an ASEA stack and doesn't need to be deployed by LZA.

**Resolution or workaround:** You can comment out the static route in the `network-config.yaml` file to prevent the creation of the route by LZA.


### convert-config should not convert AutomationAssumeRole parameters for AWS Custom Config Rules remediation

**Description:** LZA handles the IAM Roles and Policies for custom config rule detection Lambda and remediation SSM document differently than ASEA. In the current state, convert-config generates a configuration that will generate an error at deployment time if the `remediation-params` in ASEA configuration contains a parameter named `AutomationAssumeRole`.

**Symptom or error message:** The SecurityResourcesStack stack fails on the creation of custom AWS Config Rule with the error `InvalidParameterValueException`.

**Resolution or workaround:** The `AutomationAssumeRole` parameter is automatically provided by LZA with the created role. You can comment the `AutomationAssumeRole` parameters in the remediation section of your custom config rules in security-config.yaml. See the [Custom AWS Config Rules](./comparison/feature-specific-considerations.md#custom-aws-config-rules) section in the Feature Specific Considerations for more details about AWS Custom Config Rules.


### ASEAResources.json Synchronization Issue

**Description:** In certain circumstances during the upgrade process, the LZA Pipeline may fail with `<resource name>` already exists in stack `<stack id>`. This error occurs because of inconsistencies with the resource mappings and the current state of the CloudFormation deployed by the LZA. To resolve this issue, the LZA pipeline can be re-run from the beginning to synchronize resource mappings If the issue still persists after the pipeline has been re-run, please contact AWS support.

**Root cause:** The synchronization issue stems from the following sequential processing order in the LZA pipeline:
1. Stack synthesis occurs before the completion of the import ASEA resources stage (in the bootstrap stage)
2. The aseaResources.json file is not written until *after* stack synthesis
3. Consequently, synthesized stacks do not reflect resource modifications (additions or removals) made during the import ASEA resources stage

**Resolution or workaround:**  If resource synchronization issues are encountered, executing the LZA pipeline can be re-run from the beginning to synchronize resource mappings.

## Landing Zone Accelerator known issues
The following issues will not prevent a successful upgrade from ASEA to LZA, but can impact functionalities and operations in the upgraded Landing Zone.

### Error adding a new route targeting firewall instance

**Description:** After a successful upgrade, you try to add in `network-config.yaml` a route entry that targets ENI 0 of a firewall appliance using the lookup variable `${ACCEL_LOOKUP::EC2:ENI_0:Firewall_azA:Id}`

**Symptom or error message:** Error in the NetworkAssociationsStack after adding a route targeting ENI 0 of a firewall appliance.

```
Resource handler returned message: "Invalid id: "${ACCEL_LOOKUP::EC2:ENI_0:Firewall_azA:Id}" (expecting "eni-...")
```

**Resolution or workaround:** A fix will be available in a future version of LZA.


### Some AWS Config Rules do not evaluate after the upgrade

**Description:** Some AWS Config Rules deployed by LZA do not evaluate (i.e Last successful detective evaluation appears as 'Not Available' in the console). The equivalent ASEA Config Rule evaluates correctly.

**Symptom or error message:** The scope of changes of Config Rule is set to an empty list of Resource types instead of scoped to **All changes** as in ASEA.

**Resolution or workaround:** A fix will be available in a future version of LZA. Manually changing the Scope of changes to "All resources" can be a short-term remediation. Alternatively you can opt-out of removing the ASEA Config Rules in the post-upgrade phase. (this will result in duplicate rules being evaluated)


### Removal of interface endpoints fails in ImportAseaResources stage

**Description:** Failure when attempting to remove an interface endpoint that was deployed by ASEA prior to LZA upgrade.

**Symptom or error message:** Failure in ImportAseaResources

```
ASEA-SharedNetwork-Phase2-VpcEndpoints1 failed: Error [ValidationError]: Template format error: Unresolved resource dependencies [SsmParamEndpointVpccodecommitDns] in the Resources block of the template
```

**Resolution or workaround:** A fix will be available in a future version of LZA.


### Resources are not deleted after being removed from configuration file

**Description:** You attempt to remove a resource that was deployed by ASEA from the LZA configuration file and it is not removed after a successful LZA pipeline run.

**Symptom or error message:** The LZA pipeline runs with success, but the resource is not deleted.

**Resolution or workaround:** Not all ASEA resources support deletion through the LZA configuration and pipeline. Review the [ASEA Resource Handlers](./asea-resource-handlers.md) page for the current state of supported handlers.