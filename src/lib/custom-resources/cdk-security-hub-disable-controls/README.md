# Security Hub Disable Controls

This is a custom resource to disable Security Hub specific controls using `describeStandards`, `getEnabledStandards`, `describeStandardControls` and `updateStandardControls` API calls.

## Usage

    import { SecurityHubDisableControls } from '@aws-accelerator/custom-resource-security-hub-disable-controls';

    const disableSecurityHubControlsResource = new SecurityHubDisableControls(this, 'DisableSecurityHubControls`, {
        standards: standards.standards,
    });

## Input Example

    [
      {
        "name": "AWS Foundational Security Best Practices v1.0.0",
        "controls-to-disable": [
          "IAM.1"
        ]
      },
      {
        "name": "PCI DSS v3.2.1",
        "controls-to-disable": [
          "PCI.IAM.3",
          "PCIDSS8.3.1"
        ]
      },
      {
        "name": "CIS AWS Foundations Benchmark v1.2.0",
        "controls-to-disable": [
          "CIS.1.3",
          "CIS1.11"
        ]
      }
    ]
