interface BootstrapDetailsInput {
  accounts: string[];
  operationsAccountId: string;
}

interface BootstrapOutput {
  region: string;
  bucketName: string;
  bucketDomain: string;
}

export const handler = async (input: BootstrapDetailsInput) => {
  console.log(`Get Bootstrap Accounts...`);
  console.log(JSON.stringify(input, null, 2));
  const outputs: BootstrapOutput[] = [];
  const { accounts, operationsAccountId } = input;
  const opsIndex = accounts.indexOf(operationsAccountId);
  if (opsIndex !== -1) {
    accounts.splice(opsIndex, 1);
  }
  console.log(JSON.stringify(outputs, null, 2));
  return accounts;
};
