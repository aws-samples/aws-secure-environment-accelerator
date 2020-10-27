# AWS Secure Environment Accelerator

# **Roadmap**

- This is an unofficial roadmap to provide customers with a general product direction
- This roadmap does not constitute a commitment, items can be added, removed, and re-prioritized at any time, for any reason
- We are not providing any feature release timelines or commitments

---

## In-Progress

- Deploy SSM Automation documents (needed for AWS Config Remediation)
- Deploy Managed AWS Config rules per ou, globally
  - First sample rule: auto-enable logging on new ELB's (includes remediation)
  - Followed by a collection of NIST 800-53 non-remediating rules
  - Include SCP to protect 'PBMMAccel-' prefixed Config rules
- Documentation updates, improvements and finalization
- Ongoing defect remediation and codebase improvements

## Planned

- Deploy additional specific remediating Config rules
  - Dependant on current in-progress tasks
  - Auto-remediate unencrypted S3 buckets
  - Auto-remediate missing role on all new and existing EC2 instances
  - Auto-remediate missing permissions on all new and existing EC2 instances
    - See: https://aws.amazon.com/blogs/mt/applying-managed-instance-policy-best-practices/
  - Deploy Customer provided Lambda's (if required for above Config rule remediations)
- Enable NEW Guardduty S3 features moved from Macie
- Push CloudWatch Log Agent using Run Command - all instances
- Enable 'SSM Global Inventory (Managed Instance Config)
  - https://docs.aws.amazon.com/config/latest/developerguide/recording-managed-instance-inventory.html
  - https://aws.amazon.com/about-aws/whats-new/2018/11/aws-systems-manager-now-supports-multi-account-and-multi-region-inventory-view/
- Firewall tweaks: Add out-of-box A/P firewall support, 2nd tunnel support
- Add support for this new S3 feature: https://aws.amazon.com/about-aws/whats-new/2020/10/amazon-s3-object-ownership-enables-bucket-owners-to-automatically-assume-ownership-of-objects-uploaded-to-their-buckets/
- Full PBMM/Medium Cloud Security Profile ITSG write-ups / Documentation
- SCP improvements and improved coverage (i.e. S3)

## Assessing

- Spoke sub-account local VPC CIDR management
- Deploy customer provided Service Catalog Items
- Improve existing ALB deployment codebase (add http support, alarms, add seperate health-check VIF)
- Mechanism to allow sub-accounts to request perimeter FW/ALB flow updates
- Enable WAF on ALB's
- Allow disabling SH rules on a per OU/account basis
- Email SH findings/alerts based on risk rating
- Encrypt all CWL groups w/CMK
- Open security tools outside Canada (Core OU only?)
- Config file cleanup and formal JSON schema
  - Adopt a JSON pointer syntax in config file (allow duplicate object naming)
  - improve consistency, remove type mutations, ensure multiples are implemented (or remove them until supported)
  - config file to become a contract

## WISH LIST

- Accelerator Wizard based GUI interface (to abstract/hide the configuration file)
  - Easy mode (limited selections) and Advanced mode (extreme customization)
  - Deployed in Ops account, permissions based on IAM credentials
    - Org Admin can make any configuration change
    - Account Admin creates accounts, makes minor changes, approves user requests
    - Users can request a 'set of accounts' of a certain type, request account changes, a flow, or a custom vpc
  - Phased deliver (Org Admin Wizard on day 1, slowly add workflows)

---

[...Return to Accelerator Table of Contents](./index.md)
