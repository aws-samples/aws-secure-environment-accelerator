import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';

export interface StoreStackOutputInput {
  acceleratorPrefix: string;
  stackOutputSecretId: string;
  assumeRoleName: string;
  accounts: Account[];
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

export const handler = async (input: StoreStackOutputInput) => {
  console.log(`Storing stack output...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    acceleratorPrefix,
    stackOutputSecretId,
    assumeRoleName,
    accounts,
    configFilePath,
    configRepositoryName,
    configCommitId,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const supportedRegions = acceleratorConfig['global-options']['supported-regions'];

  const outputs: StackOutput[] = [];
  for (const account of accounts) {
    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);

    for (const region of supportedRegions) {
      const cfn = new CloudFormation(credentials, region);
      const stacks = cfn.listStacksGenerator({
        StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE'],
      });
      for await (const summary of stacks) {
        if (!summary.StackName.startsWith(acceleratorPrefix)) {
          console.warn(`Skipping stack with name "${summary.StackName}"`);
          continue;
        }
        const stack = await cfn.describeStack(summary.StackName);
        if (!stack) {
          console.warn(`Could not load stack with name "${summary.StackName}"`);
          continue;
        }
        const acceleratorTag = stack.Tags?.find(t => t.Key === 'Accelerator');
        if (!acceleratorTag) {
          console.warn(`Could not find Accelerator tag in stack with name "${summary.StackName}"`);
          continue;
        }

        console.debug(`Storing outputs for stack with name "${summary.StackName}"`);
        stack.Outputs?.forEach(output =>
          outputs.push({
            accountKey: account.key,
            outputKey: output.OutputKey,
            outputValue: output.OutputValue,
            outputDescription: output.Description,
            outputExportName: output.ExportName,
          }),
        );
      }
    }
  }

  // Store a the output in the output secret
  const secrets = new SecretsManager();
  await secrets.putSecretValue({
    SecretId: stackOutputSecretId,
    SecretString: JSON.stringify(outputs),
  });

  return {
    status: 'SUCCESS',
  };
};
