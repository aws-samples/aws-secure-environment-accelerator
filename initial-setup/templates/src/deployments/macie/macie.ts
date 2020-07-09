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

export interface MacieStep2Props {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
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
  regions?.map(region => {
    // Macie admin need to be enabled from master account of the organization
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey, region);

    if (masterAccountId) {
      const admin = new MacieEnableAdmin(masterAccountStack, 'MacieEnableAdmin', {
        accountId: masterAccountId,
      });
    }
  });
}

export async function step2(props: MacieStep2Props) {
  const { accountBuckets, accountStacks, config, accounts } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const regions = await getValidRegions(config);
  regions.map(region => {
    // Macie need to be turned on from macie master account
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);
    const frequency = config['global-options']['central-security-services']['macie-frequency'];

    let findingPublishingFrequency = MacieFrequency.SIX_HOURS;
    if (frequency === 6) {
      findingPublishingFrequency = MacieFrequency.SIX_HOURS;
    } else if (frequency === 1) {
      findingPublishingFrequency = MacieFrequency.ONE_HOUR;
    } else if (frequency === 15) {
      findingPublishingFrequency = MacieFrequency.FIFTEEN_MINUTES;
    }
    const enable = new MacieEnable(masterAccountStack, 'MacieEnable', {
      findingPublishingFrequency,
      status: MacieStatus.ENABLED,
    });

    // Add org members to Macie
    const accountDetails = accounts.map(account => ({
      accountId: account.id,
      email: account.email,
    }));
    for (const [index, account] of Object.entries(accountDetails)) {
      const members = new MacieCreateMember(masterAccountStack, `MacieCreateMember${index}`, account);
    }

    // turn on auto enable
    new MacieUpdateConfig(masterAccountStack, 'MacieUpdateConfig', {
      autoEnable: true,
    });

    // configure export S3 bucket
    const accountBucket = accountBuckets[masterAccountKey];
    new MacieExportConfig(masterAccountStack, 'MacieExportConfig', {
      bucketName: accountBucket.bucketName,
      keyPrefix: 'macie',
      kmsKeyArn: accountBucket.encryptionKey?.keyArn,
    })
  });
}

export async function getValidRegions(config: AcceleratorConfig) {
  const regions = config['global-options']['supported-regions'];
  const excl = config['global-options']['central-security-services']['macie-excl-regions'];
  const validRegions = regions.filter(x => !excl?.includes(x));
  return validRegions;
}
