import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { MacieEnableAdmin } from '@custom-resources/macie-enable-admin';
import { MacieCreateMember } from '@custom-resources/macie-create-member';
import { MacieEnable, MacieFrequency, MacieStatus } from '@custom-resource/macie-enable';

export interface MacieStepProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
}

export async function step1(props: MacieStepProps) {
  const { accountStacks, config, accounts } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;
  const frequency = config['global-options']['central-security-services']['macie-frequency'];

  // skipping Macie if not enabled
  if (!enableMacie) {
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');

  const masterAccountKey = config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  const regions = config['global-options']['supported-regions'];
  regions?.map(region => {
    // Macie need to be enabled from master account of the organization
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey, region);

    if (masterAccountId) {
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
        status: MacieStatus.ENABLE,
      });

      const admin = new MacieEnableAdmin(masterAccountStack, 'MacieEnableAdmin', {
        accountId: masterAccountId,
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
  const regions = config['global-options']['supported-regions'];
  regions?.map(region => {
    const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);

    const accountDetails = accounts.map(account => ({
      accountId: account.id,
      email: account.email,
    }));
    const members = new MacieCreateMember(masterAccountStack, 'MacieCreateMember', {
      accountDetails,
    });
  });
}
