import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig, CertificatesConfig } from '@aws-pbmm/common-lambda/lib/config';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { Account } from './load-accounts-step';
import { StackOutput, getStackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { ACM } from '@aws-pbmm/common-lambda/lib/aws/acm';

interface certManagerInput {
  assumeRoleName: string;
  accounts: Account[];
  configSecretSourceId: string;
  stackOutputSecretId: string;
}

export const handler = async (input: certManagerInput) => {
  console.log('Requesting or Importing certificates into AWS Certificate Manager ...');
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, accounts, configSecretSourceId, stackOutputSecretId } = input;

  const secrets = new SecretsManager();
  const configString = await secrets.getSecret(configSecretSourceId);
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  const acceleratorConfig = AcceleratorConfig.fromString(configString.SecretString!);
  const globalOptionsConfig = acceleratorConfig["global-options"];
  const centralBucket = globalOptionsConfig["central-bucket"];
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

  // TODO Cache the account credentials in the STS class to improve reusability
  const accountCredentials: { [accountId: string]: aws.Credentials } = {};
  const getAccountCredentials = async (accountId: string): Promise<aws.Credentials> => {
    if (accountCredentials[accountId]) {
      return accountCredentials[accountId];
    }
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    accountCredentials[accountId] = credentials;
    return credentials;
  };

  const requestOrImportCert = async (accountKey: string, certConfig: CertificatesConfig): Promise<void> => {
    const masterAccount = accounts.find(a => a.key === 'master');
    if (!masterAccount) {
      throw new Error(`Cannot find account with key master`);
    }
    const masterAccountId = masterAccount.id;
    const masterCredentials = await getAccountCredentials(masterAccountId);

    const account = accounts.find(a => a.key === accountKey);
    if (!account) {
      throw new Error(`Cannot find account with key "${accountKey}"`);
    }
    const accountId = account.id;
    const credentials = await getAccountCredentials(accountId);

    const s3 = new S3(masterCredentials);
    const acm = new ACM(credentials);

    // check whether arn exists before creating new cert

    if (certConfig.type === 'import') {
      const importCertificateRequest: aws.ACM.ImportCertificateRequest = {
        Certificate: await s3.getObjectBodyAsString({
          Bucket: centralBucket, 
          Key: certConfig.cert!
        }),
        PrivateKey: await s3.getObjectBodyAsString({
          Bucket: centralBucket, 
          Key: certConfig["priv-key"]!
        }),
        CertificateArn: certConfig.arn,
        CertificateChain: certConfig.chain,
        Tags: [
          {
            Key: 'Accelerator',
            Value: 'PBMM',
          },
        ],
      };
      const importCertificateResponse = await acm.importCertificate(importCertificateRequest);
      console.log('importCertificateResponse: ', importCertificateResponse);
      console.log(`Requested ACM Certificate for account - ${accountKey}`);

      // store arn here
    } else if (certConfig.type === 'request') {
      const requestCertificateRequest: aws.ACM.RequestCertificateRequest = {
      DomainName: certConfig.domain!,
      CertificateAuthorityArn: certConfig.arn,
      DomainValidationOptions: [
        {
          DomainName: certConfig.domain!,
          ValidationDomain: certConfig.domain!,
        },
      ],
      IdempotencyToken: 'idempotencyToken',
      Options: {
        CertificateTransparencyLoggingPreference: 'ENABLE',
      },
      SubjectAlternativeNames: certConfig.san!,
      Tags: [
        {
          Key: 'Accelerator',
          Value: 'PBMM',
        },
      ],
      ValidationMethod: certConfig.validation,
    };

    console.log(`Requested ACM Certificate for account - ${accountKey}`);

    // store arn here
    }
  };

  const getNonMandatoryAccountsPerOu = (ouName: string, mandatoryAccKeys: string[]): Account[] => {
    const accountsPerOu: Account[] = [];
    for (const account of accounts) {
      if (account.ou === ouName && !mandatoryAccKeys.includes(account.key)) {
        accountsPerOu.push(account);
      }
    }
    return accountsPerOu;
  };

  const mandatoryAccountKeys: string[] = [];
  // creating assets for default account settings
  const mandatoryAccountConfig = acceleratorConfig.getMandatoryAccountConfigs();
  for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
    const certificatesConfig = accountConfig.certificates;
    if (certificatesConfig && certificatesConfig.length > 1) {
      for (const certificateConfig of certificatesConfig) {
        mandatoryAccountKeys.push(accountKey);
        await requestOrImportCert(accountKey, certificateConfig);
      }
    }
  }

  // creating assets for org unit accounts
  const orgUnits = acceleratorConfig.getOrganizationalUnits();
  for (const [orgName, orgConfig] of orgUnits) {
    const certificatesConfig = orgConfig.certificates;
    if (certificatesConfig && certificatesConfig.length > 1) {
      for (const certificateConfig of certificatesConfig) {
        const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
        for (const orgAccount of orgAccounts) {
          await requestOrImportCert(orgAccount.key, certificateConfig);
        }
      }
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Successfully requested or imported certificates into AWS Certificate Manager.',
  };
};
