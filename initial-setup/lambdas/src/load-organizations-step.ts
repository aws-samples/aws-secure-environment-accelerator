import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { LoadConfigurationOutput } from './load-configuration-step';

export interface Organization {
  key: string;
  id: string;
  name: string;
}

export interface LoadOrganizationsInput {
  organizationsSecretId: string;
  configuration: LoadConfigurationOutput;
}

export type LoadOrganizationsOutput = {
  organizationalUnits: Organization[];
};

export const handler = async (input: LoadOrganizationsInput): Promise<LoadOrganizationsOutput> => {
  console.log(`Loading Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { organizationsSecretId, configuration } = input;
  const org = new Organizations();
  // Retrive all organizations in Master account
  const awsOus = await org.listOrganizationalUnits();

  const organizationalUnits: Organization[] = [];

  // Validate organizations with load-configuration-output
  for (const acceleratorOu of configuration.organizationalUnits) {
    const awsOu = awsOus.find(ou => ou.Name === acceleratorOu.ouName);
    if (!awsOu) {
      console.log(`Cannot find organizational unit "${acceleratorOu}" that is used by Accelerator`);
      continue;
    }

    organizationalUnits.push({
      id: awsOu.Id!,
      name: awsOu.Name!,
      key: acceleratorOu.ouKey,
    });
  }
  // Store the organizations configuration in the accounts secret
  const secrets = new SecretsManager();
  await secrets.putSecretValue({
    SecretId: organizationsSecretId,
    SecretString: JSON.stringify(organizationalUnits),
  });

  // Find all relevant accounts in the organization
  return {
    ...configuration,
    organizationalUnits,
  };
};
