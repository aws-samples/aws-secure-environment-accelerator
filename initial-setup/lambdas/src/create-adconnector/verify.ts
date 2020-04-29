import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { AdConnectorOutput } from './create';

interface StepInput {
  createOutput: AdConnectors;
}

interface AdConnectors {
  adConnectorOutput: AdConnectorOutput[];
}

export const handler = async (input: StepInput): Promise<string> => {
  console.log(`Verifying status of provisioned AD Connector`);
  console.log(JSON.stringify(input, null, 2));

  const status: string[] = [];
  const sts = new STS();

  for (const adConnector of input.createOutput.adConnectorOutput) {
    const credentials = await sts.getCredentialsForAccountAndRole(adConnector.accountId, adConnector.assumeRoleName);
    const directoryService = new DirectoryService(credentials);
    const adConnectors = await directoryService.getADConnectors();
    const adConenct = adConnectors.find(o => o.directorId === adConnector.directoryId);
    status.push(adConenct!.status);
  }
  const statusCreate = status.filter(s => s === 'Creating');
  const statusFailed = status.filter(s => s === 'Failed');

  if (statusFailed && statusFailed.length > 0) {
    return 'Failed';
  }

  if (statusCreate && statusCreate.length > 0) {
    return 'IN_PROGRESS';
  }

  return 'SUCCESS';
};
