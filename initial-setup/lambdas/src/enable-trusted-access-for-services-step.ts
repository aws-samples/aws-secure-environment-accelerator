import * as aws from 'aws-sdk';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { FMS } from '@aws-pbmm/common-lambda/lib/aws/fms';
import { IAM } from '@aws-pbmm/common-lambda/lib/aws/iam';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { LoadConfigurationInput } from './load-configuration-step';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';

interface EnableTrustedAccessForServicesInput extends LoadConfigurationInput {
  accounts: Account[];
}

export const handler = async (input: EnableTrustedAccessForServicesInput) => {
  console.log(`Enable Trusted Access for AWS services within the organization ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, configRepositoryName, configFilePath, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const securityAccountKey = config["global-options"]["central-security-services"].account;

  const securityAccount = accounts.find(a => a.key === securityAccountKey);
  if (!securityAccount) {
    console.warn('Cannot find account with type security');
    return;
  }
  const securityAccountId: string = securityAccount.id;

  const ram = new aws.RAM();
  await ram.enableSharingWithAwsOrganization().promise();

  // await org.enableAWSServiceAccess('ram.amazonaws.com');
  console.log('Enabled Resource Access Manager service access within the Organization.');

  const org = new Organizations();
  await org.enableAWSServiceAccess('fms.amazonaws.com');
  console.log('Enabled Firewall Manager service access within the Organization.');

  const fms = new FMS();
  await fms.associateAdminAccount(securityAccountId);
  console.log('Security account registered as admin account for Firewall Manager in the organization.');

  await org.enableAWSServiceAccess('access-analyzer.amazonaws.com');
  console.log('Enabled Access Analyzer service access within the Organization.');

  const iam = new IAM();
  // as access analyzer will be created in security account, creating service linked role specifically in master.
  try {
    await iam.createServiceLinkedRole('access-analyzer.amazonaws.com');
  } catch (e) {
    if (
      e.message ===
      'Service role name AWSServiceRoleForAccessAnalyzer has been taken in this account, please try a different suffix.'
    ) {
      // ignore exception
    } else {
      throw e;
    }
  }
  console.log('AWS Service Linked Role created for Access Analyzer service in master account.');

  await org.registerDelegatedAdministrator(securityAccountId, 'access-analyzer.amazonaws.com');
  console.log('Security account registered as delegated administrator for Access Analyzer in the organization.');

  return {
    status: 'SUCCESS',
    statusReason: `Successfully enabled trusted access for AWS services within the organization.`,
  };
};
