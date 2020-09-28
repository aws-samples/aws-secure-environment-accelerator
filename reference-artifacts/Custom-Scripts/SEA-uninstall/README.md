## AWS SEA Uninstall Script

This uninstall script is a work in-progress and was designed for use by our development and test teams in **_non-production_** envionments. This script is destructive - **use at your own risk**.

Before running this script you must manually delete AWS SSO (No API's exist)

Other Notes:

1. Route 53 Resolvers?
2. Directory Service?

- Operations account, unshare, delete? (Phase 2 Operations)

3. SSM Keys?
4. GuardDuty?
5. Config?

## Requirements

- boto3
- tabulate
