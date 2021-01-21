interface BootstrapDetailsInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stackOutputs: any;
  accounts: string[];
  operationsAccountId: string;
}

interface BootstrapOutput {
  region: string;
  bucketName: string;
  bucketDomain: string;
}

interface StackOutput {
  OutputKey: string;
  OutputValue: string;
  Description: string;
}

export const handler = async (input: BootstrapDetailsInput) => {
  console.log(`Get Bootstrap Output...`);
  console.log(JSON.stringify(input, null, 2));
  const outputs: BootstrapOutput[] = [];
  const { accounts, operationsAccountId, stackOutputs } = input;
  for (const stackOutput of stackOutputs) {
    const inputDetails = stackOutput.opsBootstrapOutput.Output;
    const stackOutputsObj: StackOutput[] = inputDetails.verify.outputs;
    outputs.push({
      region: inputDetails.region,
      bucketDomain: stackOutputsObj.find(s => s.OutputKey === 'BucketDomainName')?.OutputValue!,
      bucketName: stackOutputsObj.find(s => s.OutputKey === 'BucketName')?.OutputValue!,
    });
  }
  const opsIndex = accounts.indexOf(operationsAccountId);
  if (opsIndex !== -1) {
    accounts.splice(opsIndex, 1);
  }
  console.log(JSON.stringify(outputs, null, 2));
  return {
    outputs,
    accounts,
  };
};
