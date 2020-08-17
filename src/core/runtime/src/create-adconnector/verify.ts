import { DirectoryService } from '@aws-accelerator/common/src/aws/directory-service';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { AdConnectorOutput } from './create';

interface StepInput {
  createOutput: AdConnectors;
}

interface AdConnectors {
  adConnectorOutputs: AdConnectorOutput[];
}

export const handler = async (input: StepInput): Promise<string> => {
  console.log(`Verifying status of provisioned AD Connector`);
  console.log(JSON.stringify(input, null, 2));

  const status: string[] = [];
  const sts = new STS();

  for (const adConnectorOutput of input.createOutput.adConnectorOutputs) {
    const credentials = await sts.getCredentialsForAccountAndRole(
      adConnectorOutput.accountId,
      adConnectorOutput.assumeRoleName,
    );
    const directoryService = new DirectoryService(credentials);
    const adConnectors = await directoryService.getADConnectors();
    const adConnector = adConnectors.find(o => o.directoryId === adConnectorOutput.directoryId);
    status.push(adConnector!.status);
  }

  const statusFailed = status.filter(s => s === 'Failed');
  if (statusFailed && statusFailed.length > 0) {
    return 'FAILED';
  }

  const statusCreate = status.filter(s => s === 'Creating');
  if (statusCreate && statusCreate.length > 0) {
    return 'IN_PROGRESS';
  }

  return 'SUCCESS';
};
