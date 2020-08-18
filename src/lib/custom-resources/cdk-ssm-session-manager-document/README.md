# Security Hub Enable Standards

This is a custom resource to enable Security Hub Standards and disable specific controls Used `describeStandards`, `batchEnableStandards`, `describeStandardControls` and `updateStandardControls` API calls.

## Usage

    import { SecurityHubEnable } from '@aws-accelerator/custom-resource-security-hub-enable';

    const enableSecurityHubResource = new SecurityHubEnable(this, 'EnableSecurityHubStandards`, {
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
