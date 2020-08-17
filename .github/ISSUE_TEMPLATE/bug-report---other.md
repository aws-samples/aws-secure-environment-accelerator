---
name: Bug report - Other
about: Used to report bugs not covered by a specific bug category
title: "[BUG][OTHER] Meaningful bug description"
labels: bug
assignees: Brian969

---

Bug reports which fail to provide the required information will be closed without action.

**Required Basic Info**
- Accelerator Version:  (eg. v1.1.6)
- Install Type: (Clean or Upgrade)
- Install Branch: (ALZ or Standalone)
- Upgrade from version: (N/A or v1.x.y)
- Which State did the Main State Machine Fail in: (e.g. N/A, Phase 0)

**INTERNAL ONLY - TEMPORARY**
- please place the account in a group named Accel-Issue
- please provide bmycroft@ access to your internal failed master AWS account

**Describe the bug**
(A clear and concise description of what the bug is.)

**Failure Info**
- What error messages have you identified, if any: 
- What symptoms have you identified, if any:

**Required files**
- Please provide a copy of your config.json file (sanitize if required)
- If a CodeBuild step failed- please provide the full CodeBuild Log
- If a Lambda step failed - please provide the full Lambda CloudWatch Log
- In many cases it would be helpful if you went into the failed sub-account and region, CloudFormation, and provided a screenshot of the Events section of the failed, deleted, or rolled back stack including the last successful item, including the first couple of error messages (bottom up)

**Steps To Reproduce**
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Additional context**
Add any other context about the problem here.
