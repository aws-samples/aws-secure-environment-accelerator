# Upgrading from ASEA to Landing Zone Accelerator (LZA)

## Overview

The AWS Secure Environment Accelerator (ASEA) launched in 2020 in order for Canadian customers to implement landing zones that complied with the Canadian Centre for Cyber Security Medium Cloud (CCCS-M) profile. As our services continued to evolve, a long-term strategy and plan were developed in 2021 to incorporate features and lessons learned from ASEA, as part of this strategy AWS launched Landing Zone Accelerator on AWS (with Control Tower) which is now the preferred solution for accelerating customer landing zones globally.

This technical guide assists customers in performing an in-place upgrade from ASEA Landing Zone to Landing Zone Accelerator (LZA). The target audience is technical personnel responsible for the deployment and operational management of landing zones.

This documentation package includes:

1. Step-by-step upgrade instructions
2. Command-line upgrade tools
3. Phase-by-phase execution guidance

The upgrade process is executed through a series of command-line scripts, designed to guide users through multiple upgrade phases systematically.

## High-level process

To perform a successful upgrade, there is a sequence of tasks that must be completed before the upgrade can begin. The first task involves generating the configuration file for the upgrade tool. Subsequent tasks check that all ASEA resources currently deployed are in the correct state, update ASEA to the latest version, and remediate any resource drift of deployed ASEA resources using the provided scripts. Once the resources are remediated and ASEA is upgraded to the latest version, customers will then enable a new configuration option in the ASEA configuration file that will instruct the ASEA state machine to prepare the environment for upgrade by removing resources that are only necessary to run the ASEA state machine, and other ASEA specific tasks. This will also effectively disable all ASEA CloudFormation custom resources from modifying any of the resources that have been deployed. After the final ASEA state machine run, the ASEA installer stack can be removed from the environment to completely disable and remove ASEA.

Once the ASEA installer stack has been removed, the customer will run a script that will create a mapping of every resource in every account and region that ASEA has deployed, and store that file in Amazon S3 and AWS CodeCommit. This mapping will be used by the Landing Zone Accelerator (LZA) to identify ASEA specific resources that must be modified or referenced in later stages of the upgrade. Once the mapping file is generated, the LZA configuration file generation script can also be run. This file in conjunction with the mapping, will be used to create the LZA configuration files during the upgrade.

After the LZA configuration files are generated, they will be placed in a CodeCommit repository residing in the home installation region of ASEA. Then, the LZA can be installed and reference the configuration repository created above. During the installation, the LZA will reference the newly created configuration, and the LZA code pipeline will install two additional stages. The first stage created will evaluate and create references that the LZA specific resource stacks can reference based off of configuration changes. This stage is executed before any core LZA stages are executed. The last stage created for upgraded environments is executed after all LZA stages are executed. This stage is responsible for adding dependencies created by the LZA to ASEA created stacks to ensure that all resources are handled correctly during the execution of the LZA CodePipeline.

Once the LZA is installed, customer resources will continue to exist and are still modifiable, but interaction with some ASEA resources that remain are handled through the LZA configuration files. Management of LZA native environments and upgraded environments will see almost no difference.

Before starting we strongly encourage you to go through the full documentation and review the [Key differences between ASEA and LZA](./comparison/index.md) and [Feature specific considerations](./comparison/feature-specific-considerations.md). The preparation steps can be done in advance, can be run multiple times and will not modify your current environment. The upgrade steps should be completed when you are ready to apply the upgrade to your environment.

- [Key differences between ASEA and LZA](./comparison/index.md)
    - [Feature specific considerations](./comparison/feature-specific-considerations.md)
- [Preparation](./preparation/index.md)
    1. [Pre-requisites and configuration](./preparation/prereq-config.md)
    2. [Resource mapping and drift detection](./preparation/resource-mapping-drift-detection.md)
    3. [Handling drift from Resource mapping](./preparation/drift-handling.md)
    4. [Configuration conversion](./preparation/configuration-conversion.md)
    5. [Pre-upgrade validations](./preparation/validation.md)
- [Upgrade](./upgrade/index.md)
    1. [Optional preparation steps](./upgrade/optional-steps.md)
    2. [Disable ASEA](./upgrade/disable-asea.md)
    3. [Install LZA](./upgrade/install-lza.md)
    4. [Finalize the upgrade](./upgrade/finalize.md)
- FAQ and Troubleshooting
    - [FAQ](./faq.md)
    - [Troubleshooting](./troubleshooting.md)
    - [Rollback strategy](./rollback.md)
    - [ASEA Resource Handlers](./asea-resource-handlers.md)
    - [Known issues](./known-issues.md)
