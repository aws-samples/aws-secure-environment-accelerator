# Handling Drift from Resource Mapping

After executing the Resource Mapping and Drift Detection Scripts you need to check the status of drifted resources and properly handle each case.

At the root of the **Mapping Output Bucket** a file named `AllDriftDetectedResources.csv` is created with a summary of all ASEA resources that have drifted. Download this file and inspect each row.

For a more granular look at Drift Detection, this is available on an account/region/stack basis as well:

- Navigate to `migration/<account-name>/<region>/<stack-name>/<stack-name>-drift-detection.csv`
- The possible values for the resources are:
  - IN_SYNC - there is no drift detected in the CloudFormation Resource
  - MODIFIED - drift has been detected in the CloudFormation Resource. The metadata in the `PropertyDifferences` column describes the drift that needs to be fixed.
  - NOT_SUPPORTED means that CloudFormation does not support drift-detection on that specific resource.
- If there is drift detected, this drift needs to be manually fixed. The specific resource and configurations which need to be addressed will be available in the drift-detection.csv file under `PropertyDifferences` or by Detecting Drift manually in the CloudFormation console (https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/detect-drift-stack.html)

### Inspect the drifted resources

You can find more details about each occurence by inspecting the drift results in AWS Console.

- Login to your Management Account
- Use the **Switch role** feature to switch to the target account using the management role (i.e. `ASEA-PipelineRole`)
- Go to the CloudFormation console and find the relevant stack
- The **Drift status** should be **Drifted**. In the **Stack actions** menu, select **View drift results**

  ![stack-drift](images/stack-drift.png)

- Find the resources in the **Modified** state, select the radio button on the left and click **View drift details**

  ![stack-drift](images/drifted-resources.png)

- The next screen will show the detailed differences. For most resources you will also have a link to open the resource in the console

### Analyze and fix the drifted resources

Each change should be analyzed, confirm if it is expected and why and determine if a corrective action is needed

- Some changes are expected as part of ASEA operations and can be safely ignored (see next section)
- If a change was manually done outside of the ASEA config file:
  - If it could have been done through the config file, you should update the config file accordingly and re-run the state machine to remove the drift
  - If the change was done manually because it cannot be done through ASEA (i.e. Direct Connect configuration, adding rules to ALB listeners, etc.) you should document the change in a central registry. Special attention should be given to those elements during the upgrade and in the post-upgrade testing phase.

## Expected drift (can generally be ignored)

Some of the resources deployed by ASEA are modified by other mechanisms in the normal course of operations of the accelerator. These resources will show as drifted, but they can be safely ignored.

**Note about tags and drift**: ASEA uses CloudFormation stack-level tags to apply tags to all supported resources in a stack. Tags applied at stack-level can generate false positives on drift detection. You can review the column `PropertyDifferencesPaths` from the `AllDriftDetectedResources.csv` file to verify the properties that have drifted to confirm if only tags are drifted on the resource.

| Stack                                                 | LogicalResourceID               | Notes                                                                               |
| ----------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| _Multiple_                                            | GatherInventoryResourceDataSync | Multiple occurrence of this finding can be reported in multiple accounts and regions |
| ASEA-LogArchive-Phase0                                | CWLKinesisStreamRole            | Inline policy dynamically added to role                                             |
| ASEA-Perimeter-Phase1-VpcStackPerimeterNestedStack... | PerimeterTgwAttach              | Difference in tags                                                                  |
| ASEA-SharedNetwork-Phase1-VpcStack...                 | \*TgwAttach                     | Difference in tags                                                                  |
| ASEA-SharedNetwork-Phase2                             | FlowLog[VPC]cloudwatchlogs      | One occurrence per VPC. Difference in tags                                           |
| ASEA-SharedNetwork-Phase2-VpcEndpoints1               | EndpointEndpoint...             | Private hosted zone for interface endpoints are shared to additional VPCs          |
| ASEA-SharedNetwork-Phase3                             | _private domain name_           | Private hosted zone for interface endpoints are shared to additional VPCs          |
