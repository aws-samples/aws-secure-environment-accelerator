# Known Issues

This is a list of known issues at the time of release. This list will be updated when new versions of the upgrade tools are released. Contact your AWS account teams for more details if these issues impact your upgrade.

## Unsupported configurations
The following configurations are not handled automatically by the current version of the upgrade tools. Also review the [Feature-specific considerations](./comparison/feature-specific-considerations.md) section of the documentation for additional details.

### Site-to-site VPNs

**Description:** Site-to-site VPNs attached to Transit Gateway configured with ASEA are not converted to LZA configuration.

**Symptom or error message:** The customer gateway and VPN connections configurations are not generated in the LZA `network-config.yaml` file.

**Resolution or workaround:** While the configurations are not present in the LZA configuration files, the already deployed resources won't be affected during the upgrade. Thus the VPN connection will still be in place and no network disruption on the VPN tunnel is anticipated during the upgrade. After the upgrade you can plan deploying new VPN configurations natively using LZA and delete the original resources created by ASEA.


## Upgrade known issues
The following issues can result in errors during the ASEA to LZA upgrade and should be fixed in the LZA configuration files before starting the LZA installation.

### convert-config should not convert AutomationAssumeRole parameters for AWS Custom Config Rules remediation

**Description:** LZA handles the IAM Roles and Policies for custom config rule detection Lambda and remediation SSM document differently than ASEA. In the current state, convert-config generates a configuration that will generate an error at deployment time if the `remediation-params` in ASEA configuration contains a parameter named `AutomationAssumeRole`.

**Symptom or error message:** The SecurityResourcesStack stack fails on the creation of custom AWS Config Rule with the error `InvalidParameterValueException`.

**Resolution or workaround:** The `AutomationAssumeRole` parameter is automatically provided by LZA with the created role. You can comment the `AutomationAssumeRole` parameters in the remediation section of your custom config rules in security-config.yaml. See the [Custom AWS Config Rules](./comparison/feature-specific-considerations.md#custom-aws-config-rules) section in the Feature Specific Considerations for more details about AWS Custom Config Rules.

### Stack exceeds the allowed maximum of 500 resources

**Description:** During LZA installation you receive an error message about exceeding the maximum number of resources allowed in a CloudFormation stack. This more commonly happen in the NetworkVPC stack.

```txt
Number of resources in stack 'ASEA-NetworkVpcStack-111222333444-ca-central-1': 571 is greater than allowed maximum of 500
```

**Root cause:** This issue is documented at the LZA level, and a fix is currently being developed and will be available in a future version of LZA. The new version will distribute resources differently between stacks to avoid the limit.
Reference: [NetworkVpc Stack exceeds the allowed maximum of 500 resources](https://github.com/awslabs/landing-zone-accelerator-on-aws/issues/320)

In the context of an ASEA to LZA upgrade, existing ASEA resources remain in the ASEA stacks, and certain resources are recreated in LZA stacks, such as NACLs, route tables, and the association of route tables to subnets. Therefore, only these types of resources can be problematic, particularly the NetworkVpcStack of the shared networking account.

**Resolution or workaround:** The only possible workaround is to adjust the configuration to reduce the number of resources to be created in the stack (e.g. optimize the number of NACL rules) or wait for the fix to be available in a future LZA version. **If you added several VPC, Subnets and NACL rules from the default ASEA configuration you are likely to face this issue and should make additional verifications before attempting the LZA upgrade**.

During the preparation steps when you generate the LZA configuration files you can confirm the number of Subnets and NACLs that will be created in the NetworkVPC stack of the Shared Network account.

The following commands can be used to estimate from the `network-config.yaml` file the number of resources that have the most impact on the total number of resources in the NetworkVpcStack. (requires installation of [yq](https://github.com/mikefarah/yq))

```bash
# Number of subnets in the networking account (corresponds to AWS::EC2::SubnetRouteTableAssociation)
cat network-config.yaml | yq '.vpcs[] | select(.account == "shared-network" and .region == "ca-central-1") | .subnets[].name' | wc -l

# Number of shared subnets in the networking account (corresponds to AWS::RAM::ResourceShare)
cat network-config.yaml | yq '.vpcs[] | select(.account == "shared-network" and .region == "ca-central-1") | .subnets[] | select(. | has("shareTargets")) | .name' | wc -l

# Number of NACLs in the networking account (corresponds to AWS::EC2::NetworkAclEntry)
cat network-config.yaml | yq '[.vpcs[] | select(.account == "shared-network" and .region == "ca-central-1") | [.networkAcls[].inboundRules, .networkAcls[].outboundRules]] | flatten | length'
```

**If the sum of those three type of resources is above 380 in a single account and region, further investigation is recommended before attempting the upgrade.**

## Landing Zone Accelerator known issues
The following issues will not prevent a successful upgrade from ASEA to LZA, but can impact functionalities and operations in the upgraded Landing Zone.

### Resources are not deleted after being removed from configuration file

**Description:** You attempt to remove a resource that was deployed by ASEA from the LZA configuration file and it is not removed after a successful LZA pipeline run.

**Symptom or error message:** The LZA pipeline runs with success, but the resource is not deleted.

**Resolution or workaround:** Not all ASEA resources support deletion through the LZA configuration and pipeline. Review the [ASEA Resource Handlers](./asea-resource-handlers.md) page for the current state of supported handlers.


# Fixed Issues

## Fixed in LZA v1.11.1

The following issued were fixed as part of LZA v1.11.1 release.

### Error adding a new route targeting firewall instance

**Description:** After a successful upgrade, you try to add in `network-config.yaml` a route entry that targets ENI 0 of a firewall appliance using the lookup variable `${ACCEL_LOOKUP::EC2:ENI_0:Firewall_azA:Id}`

**Symptom or error message:** Error in the NetworkAssociationsStack after adding a route targeting ENI 0 of a firewall appliance.

```
Resource handler returned message: "Invalid id: "${ACCEL_LOOKUP::EC2:ENI_0:Firewall_azA:Id}" (expecting "eni-...")
```

**Resolution or workaround:** Fixed in LZA v1.11.1


### Some AWS Config Rules do not evaluate after the upgrade

**Description:** Some AWS Config Rules deployed by LZA do not evaluate (i.e Last successful detective evaluation appears as 'Not Available' in the console). The equivalent ASEA Config Rule evaluates correctly.

**Symptom or error message:** The scope of changes for Config Rule is set to an empty list of Resource types instead of scoped to **All changes** as in ASEA.

**Resolution or workaround:** Fixed in LZA v1.11.1

## Fixed in LZA v1.12.0

### Error: Transit Gateway static route already exist

**Description:** During LZA install, LZA attempts to re-create a transit gateway static route table entry that already exists.

**Symptom or error message:** Error in the NetworkAssociationsStack during LZA initial installation.

```txt
ASEA-NetworkAssociationsStack-xxxxxx-ca-central-1 failed: Error: The stack named ASEA-NetworkAssociationsStack-xxxxxx-ca-central-1 failed creation, it may need to be manually deleted from the AWS console: ROLLBACK_COMPLETE: tgw-rtb-xxxxx|x.x.x.x/yy already exists in stack arn:aws:cloudformation:ca-central-1:xxxxxxx:stack/ASEA-SharedNetwork-Phase2
```

**Root cause**: The static route was deployed in an ASEA stack and doesn't need to be deployed by LZA.

**Resolution or workaround:** Fixed in LZA v1.12.0. If you had commented the static route in the `network-config.yaml` file as the previous documented workaround, you can uncomment the route to have LZA start to manage the resource.

### Removal of interface endpoints fails in ImportAseaResources stage

**Description:** Failure when attempting to remove an interface endpoint that was deployed by ASEA prior to LZA upgrade.

**Symptom or error message:** Failure in ImportAseaResources

```txt
ASEA-SharedNetwork-Phase2-VpcEndpoints1 failed: Error [ValidationError]: Template format error: Unresolved resource dependencies [SsmParamEndpointVpccodecommitDns] in the Resources block of the template
```

**Resolution or workaround:** Fixed in LZA v1.12.0
