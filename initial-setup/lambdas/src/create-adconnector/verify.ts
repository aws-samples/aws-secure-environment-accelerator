import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';

interface AdConnectors {
  accountId: string;
  directoryId: string;
  status: string;
  assumeRoleName: string;
}

interface result {
  createOutput: adConnectors;
}

interface adConnectors {
  output: AdConnectors[];
  outputCount: number;
}

export const handler = async (input: result): Promise<string> => {
  console.log(`Verifying status of provisioned AD Connector`);
  console.log(JSON.stringify(input, null, 2));

  const status: string[] = [];
  const sts = new STS();

  console.log("Create AdConnectors output", input.createOutput.output);

  for (const adConnector of input.createOutput.output) {
    const credentials = await sts.getCredentialsForAccountAndRole(adConnector.accountId, adConnector.assumeRoleName);
    const directoryService = new DirectoryService();
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
