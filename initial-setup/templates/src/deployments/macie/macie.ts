import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { MacieEnableAdmin } from '@custom-resources/macie-enable-admin';
import { MacieCreateMember } from '@custom-resources/macie-create-member';
import { MacieEnable } from '@custom-resources/macie-enable';
import { MacieUpdateConfig } from '@custom-resources/macie-update-config';
import { MacieExportConfig } from '@custom-resources/macie-export-config';
import { MacieFrequency, MacieStatus } from '@custom-resources/macie-enable-lambda';
import { AccountBuckets } from '../defaults';

export interface MacieStepProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
}

export interface MacieStep3Props {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
}

export async function enableMaciePolicy(props: MacieStep3Props) {
  const { accountBuckets, accountStacks, config, accounts } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterBucket = accountBuckets[masterAccountKey];
  // Enable Macie access see https://docs.aws.amazon.com/macie/latest/user/discovery-results-repository-s3.html
  masterBucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:GetBucketLocation', 's3:PutObject'],
      principals: [new iam.ServicePrincipal('macie.amazonaws.com')],
      resources: [masterBucket.bucketArn, masterBucket.arnForObjects('*')],
    }),
  );

  masterBucket.encryptionKey?.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'Allow Macie to use the key',
      principals: [new iam.ServicePrincipal('macie.amazonaws.com')],
      actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
      resources: ['*'],
    }),
  );
}

export async function step1(props: MacieStepProps) {
  const { accountStacks, config, accounts } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  const regions = await getValidRegions(config);
  const findingPublishingFrequency = await getFrequency(config);
  regions?.map(region => {
    // Macie admin need to be enabled from master account of the organization
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey, region);

    if (masterAccountId) {
      const admin = new MacieEnableAdmin(masterAccountStack, 'MacieEnableAdmin', {
        accountId: masterAccountId,
      });

      const enable = new MacieEnable(masterAccountStack, 'MacieEnable', {
        findingPublishingFrequency,
        status: MacieStatus.ENABLED,
      });
    }
  });
}

export async function step2(props: MacieStepProps) {
  const { accountStacks, config, accounts } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  const regions = await getValidRegions(config);
  const findingPublishingFrequency = await getFrequency(config);
  regions.map(region => {
    // Macie need to be turned on from macie master account
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);

    const enable = new MacieEnable(masterAccountStack, 'MacieEnable', {
      findingPublishingFrequency,
      status: MacieStatus.ENABLED,
    });

    // Add org members to Macie except Macie master account
    const accountDetails = accounts.map(account => ({
      accountId: account.id,
      email: account.email,
    }));
    for (const [index, account] of Object.entries(accountDetails)) {
      if (account.accountId !== masterAccountId) {
        const members = new MacieCreateMember(masterAccountStack, `MacieCreateMember${index}`, account);
      }
    }

    // turn on auto enable
    new MacieUpdateConfig(masterAccountStack, 'MacieUpdateConfig', {
      autoEnable: true,
    });
  });
}

export async function step3(props: MacieStep3Props) {
  const { accountBuckets, accountStacks, config, accounts } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  const masterBucket = accountBuckets[masterAccountKey];
  const regions = await getValidRegions(config);
  regions.map(region => {
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);
    // configure export S3 bucket
    new MacieExportConfig(masterAccountStack, 'MacieExportConfig', {
      bucketName: masterBucket.bucketName,
      keyPrefix: `${masterAccountId}/${region}/macie`,
      kmsKeyArn: masterBucket.encryptionKey?.keyArn,
    });
  });
}

export async function getValidRegions(config: AcceleratorConfig) {
  const regions = config['global-options']['supported-regions'];
  const excl = config['global-options']['central-security-services']['macie-excl-regions'];
  const validRegions = regions.filter(x => !excl?.includes(x));
  return validRegions;
}

export async function getFrequency(config: AcceleratorConfig) {
  const frequency = config['global-options']['central-security-services']['macie-frequency'];
  if (frequency === MacieFrequency.SIX_HOURS) {
    return MacieFrequency.SIX_HOURS;
  } else if (frequency === MacieFrequency.ONE_HOUR) {
    return MacieFrequency.ONE_HOUR;
  } else if (frequency === MacieFrequency.FIFTEEN_MINUTES) {
    return MacieFrequency.FIFTEEN_MINUTES;
  } else {
    return MacieFrequency.SIX_HOURS;
  }
}
