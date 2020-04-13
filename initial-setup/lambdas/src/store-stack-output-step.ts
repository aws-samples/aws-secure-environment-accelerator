import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';

export interface StoreStackOutputInput {
  stackOutputSecretId: string;
  assumeRoleName: string;
  accounts: Account[];
}

interface AccountStackOutput {
  accountKey: string;
  outputKey?: string;
  outputValue?: string;
  outputDescription?: string;
  outputExportName?: string;
}

export const handler = async (input: StoreStackOutputInput) => {
  console.log(`Storing stack output...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackOutputSecretId, assumeRoleName, accounts } = input;

  const outputs: AccountStackOutput[] = [];
  for (const account of accounts) {
    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);

    const cfn = new CloudFormation(credentials);
    const stacks = cfn.listStacksGenerator({
      StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE'],
    });
    for await (const summary of stacks) {
      const stack = await cfn.describeStack(summary.StackName);
      if (!stack) {
        console.warn(`Could not load stack with name "${summary.StackName}"`);
        continue;
      }
      const acceleratorTag = stack.Tags?.find((t) => t.Key === 'Accelerator');
      if (!acceleratorTag) {
        console.warn(`Could not find Accelerator tag in stack with name "${summary.StackName}"`);
        continue;
      }

      stack.Outputs?.forEach((output) =>
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

  // Store a the output in the output secret
  const secrets = new SecretsManager();
  await secrets.putSecretValue({
    SecretId: stackOutputSecretId,
    SecretString: JSON.stringify(outputs),
  });
};
