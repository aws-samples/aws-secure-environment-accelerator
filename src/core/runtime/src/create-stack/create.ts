import { CloudFormation, objectToCloudFormationParameters } from '@aws-accelerator/common/src/aws/cloudformation';
import { StackTemplateLocation, getTemplateBody } from '../create-stack-set/create-stack-set';

interface CreateStackInput {
  stackName: string;
  stackCapabilities: string[];
  stackParameters: { [key: string]: string };
  stackTemplate: StackTemplateLocation;
  accountId?: string;
}

export const handler = async (input: CreateStackInput) => {
  console.log(`Creating stack...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, stackCapabilities, stackParameters, stackTemplate, accountId } = input;

  console.debug(`Creating stack template`);
  console.debug(stackTemplate);

  // Load the template body from the given location
  const templateBody = await getTemplateBody(stackTemplate);

  const cfn = new CloudFormation();
  await cfn.createOrUpdateStack({
    StackName: stackName,
    TemplateBody: templateBody,
    Capabilities: stackCapabilities,
    Parameters: objectToCloudFormationParameters(stackParameters),
  });
};
