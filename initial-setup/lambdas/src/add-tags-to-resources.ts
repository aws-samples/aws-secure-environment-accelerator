import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { TagResources } from '@aws-pbmm/common-lambda/lib/aws/resource-tagging';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { getStackOutput, StackOutputs } from '../../templates/src/utils/outputs';
import { getAccountId } from '../../templates/src/utils/accounts';

interface CreateTagsRequestInput {
  accounts: Account[];
  assumeRoleName: string;
  configSecretSourceId: string;
  stackOutputSecretId: string;
}

export const handler = async (input: CreateTagsRequestInput) => {
  console.log(`Adding Tags to the shared subnets...`);
  console.log(JSON.stringify(input, null, 2));

  const { configSecretSourceId, accounts, assumeRoleName, stackOutputSecretId } = input;
  const secrets = new SecretsManager();
  const source = await secrets.getSecret(configSecretSourceId);
  const configString = source.SecretString!;
  const acceleratorConfig = AcceleratorConfig.fromString(configString);
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutputs;
  const organziationalUnits = acceleratorConfig['organizational-units'];
  const sts = new STS();

  for (let orgUnit of Object.values(organziationalUnits)) {
    //TODO Remove the below conditional block in the future when all the accounts are ready
    if (orgUnit.vpc.name != 'Central') {
      continue;
    }

    const sourceAccountId = getAccountId(accounts, orgUnit.vpc.deploy!);
    const orgAccountName = orgUnit.vpc.deploy!;
    for (const subnetConfig of orgUnit.vpc.subnets!.values()) {
      if (subnetConfig['share-to-specific-accounts'] && subnetConfig['share-to-specific-accounts'].length > 0) {
        const accountNames = subnetConfig['share-to-specific-accounts'];
        if (sourceAccountId) {
          for (const [key, subnetDefinition] of subnetConfig.definitions.entries()) {
            if (subnetDefinition.disabled) {
              continue;
            }
            const subnetIdOutputValue = `${orgUnit.vpc.name}Subnet${subnetConfig.name}az${key + 1}`;
            const subnetIdFromStackOutput = getStackOutput(outputs, orgAccountName, subnetIdOutputValue);
            for (const accountName of accountNames) {
              const accountId = getAccountId(accounts, accountName);
              const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
              const tagResources = new TagResources(credentials);

              var params = {
                Filters: [
                  {
                    Name: 'resource-id',
                    Values: [subnetIdFromStackOutput],
                  },
                ],
              };
              const isTagFound = await tagResources.isTagsFound(params);
              if (!isTagFound) {
                console.log(`Creating Tag for subnet ${subnetIdFromStackOutput} in Account ${accountName}`);
                await tagResources.createTags({
                  Resources: [subnetIdFromStackOutput],
                  Tags: [{ Key: 'Name', Value: `${subnetConfig.name}_az${key + 1}` }],
                });
              }
            }
          }
        }
      }
    }
  }
  return {
    status: 'SUCCESS',
    statusReason: `Updated the Tags for all the shared subnets`,
  };
};
