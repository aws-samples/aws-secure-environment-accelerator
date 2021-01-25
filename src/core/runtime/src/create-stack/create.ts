import { CloudFormation, objectToCloudFormationParameters } from '@aws-accelerator/common/src/aws/cloudformation';
import { StackTemplateLocation, getTemplateBody } from '../create-stack-set/create-stack-set';
import { STS } from '@aws-accelerator/common/src/aws/sts';

interface CreateStackInput {
  stackName: string;
  stackCapabilities: string[];
  stackParameters: { [key: string]: string };
  stackTemplate: StackTemplateLocation;
  accountId?: string;
  assumedRoleName?: string;
  region?: string;
  ignoreAccountId?: string;
  ignoreRegion?: string;
}

const sts = new STS();
export const handler = async (input: CreateStackInput) => {
  console.log(`Creating stack...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    stackName,
    stackCapabilities,
    stackParameters,
    stackTemplate,
    accountId,
    assumedRoleName,
    region,
    ignoreAccountId,
    ignoreRegion,
  } = input;

  if (ignoreAccountId && ignoreAccountId === accountId && !ignoreRegion) {
    return;
  } else if (ignoreAccountId && ignoreRegion && ignoreAccountId === accountId && ignoreRegion === region) {
    return;
  }
  console.debug(`Creating stack template`);
  console.debug(stackTemplate);

  // Load the template body from the given location
  const templateBody = await getTemplateBody(stackTemplate);

  let cfn: CloudFormation;
  if (accountId && assumedRoleName) {
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumedRoleName);
    cfn = new CloudFormation(credentials, region);
  } else {
    cfn = new CloudFormation();
  }
  await cfn.createOrUpdateStack({
    StackName: stackName,
    TemplateBody: templateBody,
    Capabilities: stackCapabilities,
    Parameters: objectToCloudFormationParameters(stackParameters),
  });
};
