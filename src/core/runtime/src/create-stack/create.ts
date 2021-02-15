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
}

export const handler = async (input: CreateStackInput) => {
  console.log(`Creating stack...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, stackCapabilities, stackParameters, stackTemplate, accountId, assumedRoleName } = input;

  console.debug(`Creating stack template`);
  console.debug(stackTemplate);

  // Load the template body from the given location
  const templateBody = await getTemplateBody(stackTemplate);

  let cfn: CloudFormation;
  if (accountId && assumedRoleName) {
    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumedRoleName);
    cfn = new CloudFormation(credentials);
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
