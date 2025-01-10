# Troubleshooting

## Failure in ImportASEAResourceStage

If the LZA pipeline fails in the ImportASEAResources stage and you need to restart the pipeline from the beginning. You will need to remove a file from the `asea-lza-resource-mapping-<accountId>` bucket. The name of the file is `asearesources.json`. Download a copy of the file and then delete it from the S3 bucket. The file will be recreated when the pipeline is rerun.

## Failure creating new account after upgrade when using Control Tower

Error messages:

- Account creation failed error message in the Prepare stage.
- AWS Control Tower failed to deploy one or more stack set instances: StackSet Id: AWSControlTowerBP-VPC-ACCOUNT-FACTORY-V1

If you are adding a new Control Tower account, ensure that there are no regions where VPCs are automatically created when an account is provisioned. To do this:

- Navigate to the Control Tower Home Page
- Select 'Account Factory' on the left of the page
- Click the 'Edit' button on the 'Network configuration' section
- Ensure that none of the regions are selected under 'Regions for VPC Creation'

## Timeout issues on large environments

When upgrading an ASEA environment with a large number of accounts (>100) you can encounter specific timeout issues and need to do manual changes to workaround the issues.

### JavaScript heap out of memory errors
Cause: CodeBuild does not have enough memory to synthesize very large CloudFormation stacks

Workaround: Increase the resources allocated to CodeBuild and increase NodeJS `max_old_space_size`
1. Go to CodeBuild console and locate the `ASEA-ToolkitProject` project
2. Edit the project, in the Environment section change the Compute size to the next larger size available (70 GB Memory, 36 vCPU)
3. In the Environment variables section:
  a) change the value of the `NODE_OPTIONS` variable to `--max_old_space_size=32768`
4. Release the accelerator pipeline again

Note: this manual change will need to be re-applied every time you upgrade to a new LZA version or re-run the LZA installer pipeline.

### Error in Security Stack - CloudFormation did not receive a response from your Custom Resource
Cause: Throttling can happen based on the concurrent Lambda execution quota.

Workaround: Disable the Event Bridge rule `ASEA-SecurityHubFindingsImportToCWLs` in the Security account. 

### Error in SecurityResource stack - AWS Config rate exceeded error
Cause: Too many resources are deployed in parallel, leading to rate limiting errors.

Workaround: Increase the resources allocated to CodeBuild and increase NodeJS `max_old_space_size`
1. Go to CodeBuild console and locate the `ASEA-ToolkitProject` project
2. Edit the project, in the Environment variables section:
  a) change the value of the `MAX_CONCURRENT_STACKS` variable to `75`
3. Release the accelerator pipeline again

Note: this manual change will need to be re-applied every time you upgrade to a new LZA version or re-run the LZA installer pipeline.

## Use of opt-in region - "InvalidClientTokenId: The security token included in the request is invalid"
If an AWS opt-in region (e.g. ca-west-1) is enabled in your ASEA environment you need to change the region compatibility of STS session tokens to be valid in all AWS Regions.

1. Sign in with administrative privileges in your Management account.
2. Open the IAM console. In the navigation pane, choose Account settings.
3. Under Security Token Service (STS) section Session Tokens from the STS endpoints. The Global endpoint indicates Valid only in AWS Regions enabled by default. Choose Change.
4. In the Change region compatibility dialog box, select All AWS Regions. Then choose Save changes.


Documentation: [Managing global endpoint session tokens](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_enable-regions.html#sts-regions-manage-tokens)

## Network timeout or connectivity issue running the upgrade tool
To run the upgrade tool you need to have valid credentials to your management account. The upgrade tool makes API calls to several AWS services to gather information about your configuration and create the resource mapping. It reads information from the accelerator S3 buckets, DynamoDB tables and make calls to AWS Organizations as well as AWS CloudFormation in all regions.

If running the tool from within an AWS VPC it will use the available VPC endpoints to reach the respective service endpoints. If no VPC endpoints are available or to make calls to regions other than the home region, the pubic service endpoints will be used and you need to make sure that any egress filtering you have in place allow those calls.

If running the tool from within your corporate network you need to make sure that any egress filtering you have in place allow those calls.

The following endpoints can be used by the `migration-config,`, `resource-mapping` and `convert-config` command of the upgrade tool.  If you have configured additional `supported-regions` or use a home region other than `ca-central-1`, the list needs to be updated accordingly.

```
organizations.us-east-1.amazonaws.com
sts.amazonaws.com
sts.us-east-1.amazonaws.com
codecommit.ca-central-1.amazonaws.com
s3.ca-central-1.amazonaws.com
dynamodb.ca-central-1.amazonaws.com
kms.ca-central-1.amazonaws.com
ssm.ca-central-1.amazonaws.com
cloudformation.ca-central-1.amazonaws.com
cloudformation.ap-northeast-1.amazonaws.com
cloudformation.ap-northeast-2.amazonaws.com
cloudformation.ap-northeast-3.amazonaws.com
cloudformation.ap-south-1.amazonaws.com
cloudformation.ap-southeast-1.amazonaws.com
cloudformation.ap-southeast-2.amazonaws.com
cloudformation.eu-central-1.amazonaws.com
cloudformation.eu-north-1.amazonaws.com
cloudformation.eu-west-1.amazonaws.com
cloudformation.eu-west-2.amazonaws.com
cloudformation.eu-west-3.amazonaws.com
cloudformation.sa-east-1.amazonaws.com
cloudformation.us-east-1.amazonaws.com
cloudformation.us-east-2.amazonaws.com
cloudformation.us-west-1.amazonaws.com
cloudformation.us-west-2.amazonaws.com
```

Different S3 buckets deployed by the accelerator are accessed by the tool, those calls will be made using the `<bucket-name>.s3.ca-central-1.amazonaws.com` endpoint.

## Security stack failure during LZA pipeline run after adding an opt-in region
You encounter the following error during an LZA pipeline run after adding an opt-in region such as `ca-west-1` to your enabled regions.

> The stack named ASEA-SecurityStack-<account>-ca-west-1 failed creation, it may need to be manually deleted from the AWS console: ROLLBACK_COMPLETE: Received response status [FAILED] from custom resource. Message returned: BadRequestException: The request failed because the GuardDuty service principal does not have permission to the KMS key or the resource specified by the destinationArn parameter. Refer to https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_exportfindings.html

See information about the [Central Logging bucket CMK](./comparison/kms.md#central-logging-bucket) for more details and how to fix the issue.