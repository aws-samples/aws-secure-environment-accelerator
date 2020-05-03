import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { Account } from './load-accounts-step';

interface EnableTrustedAccessForServicesInput {
  accounts: Account[];
}

export const handler = async (input: EnableTrustedAccessForServicesInput) => {
  console.log(`Enable Trusted Access for AWS services within the organization ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts } = input;
  
  const org = new Organizations();
  await org.enableAWSServiceAccess('ram.amazonaws.com');
  console.log('Enabled Resource Access Manager service access within the Organization.');

  await org.enableAWSServiceAccess('access-analyzer.amazonaws.com');
  console.log('Enabled Access Analyzer service access within the Organization.');

  const securityAccountKey = 'security';
  const securityAccount = accounts.find(a => a.key === securityAccountKey);
  if (!securityAccount) {
    throw new Error(`Cannot find account with key ${securityAccountKey}`);
  }
  const securityAccountId: string = securityAccount.id;
  await org.registerDelegatedAdministrator(securityAccountId,'access-analyzer.amazonaws.com');
  console.log('Security account registered as delegated administrator for Access Analyzer in the organization.');

  await org.enableAWSServiceAccess('fms.amazonaws.com');
  console.log('Enabled Firewall Manager service access within the Organization.');
  
  await org.registerDelegatedAdministrator(securityAccountId,'access-analyzer.amazonaws.com');
  console.log('Security account registered as delegated administrator for Firewall Manager in the organization.');

  return {
    status: 'SUCCESS',
    statusReason: `Successfully enabled trusted access for AWS services within the organization.`,
  };
};
