import { IBucket } from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { GuardDutyAdmin } from '@custom-resources/guardduty-enable-admin';
import { GuardDutyCreatePublish } from '@custom-resources/guardduty-create-publish';
import { GuardDutyAdminSetup } from '@custom-resources/guardduty-admin-setup';

export interface GuardDutyStepProps {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
}

export interface GuardDutyStep3Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
  logBucket: IBucket;
}

/**
 * Step 1 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 *
 * @param props accountStacks and config passed from phases
 */
export async function step1(props: GuardDutyStepProps) {
  const enableGuardDuty = props.config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const masterOrgKey = props.config.getMandatoryAccountKey('master');

  const masterAccountKey = props.config['global-options']['central-security-services'].account;
  const masterAccountId = getAccountId(props.accounts, masterAccountKey);
  const regions = await getValidRegions(props.config);
  regions?.map(region => {
    // Guard duty need to be enabled from master account of the organization
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterOrgKey, region);

    if (masterAccountId) {
      const admin = new GuardDutyAdmin(masterAccountStack, 'GuardDutyAdmin', {
        accountId: masterAccountId,
      });
    }
  });
}

/**
 * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 *
 * @param props accountStacks and config passed from phases
 */
export async function step2(props: GuardDutyStepProps) {
  const enableGuardDuty = props.config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const masterAccountKey = props.config['global-options']['central-security-services'].account;
  const regions = await getValidRegions(props.config);
  const accountDetails = props.accounts.map(account => ({
    AccountId: account.id,
    Email: account.email,
  }));
  regions?.map(region => {
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey, region);
    /**
     * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
     * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
     */
    new GuardDutyAdminSetup(masterAccountStack, 'GuardDutyAdminSetup', {
      memberAccounts: accountDetails,
    });
  });
}

export async function step3(props: GuardDutyStep3Props) {
  const { logBucket } = props;
  const enableGuardDuty = props.config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const logBucketKeyArn = logBucket.encryptionKey?.keyArn;
  const regions = await getValidRegions(props.config);
  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    for (const region of regions) {
      const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey, region);
      if (logBucketKeyArn) {
        const createPublish = new GuardDutyCreatePublish(accountStack, 'GuardDutyPublish', {
          destinationArn: logBucket.bucketArn,
          kmsKeyArn: logBucketKeyArn,
        });
      }
    }
  }
}

export async function enableGuardDutyPolicy(props: GuardDutyStep3Props) {
  const { accountStacks, config, accounts, logBucket } = props;

  // Grant GuardDuty permission to logBucket: https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_exportfindings.html
  logBucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:GetBucketLocation', 's3:PutObject'],
      principals: [new iam.ServicePrincipal('guardduty.amazonaws.com')],
      resources: [logBucket.bucketArn, logBucket.arnForObjects('*')],
    }),
  );

  logBucket.encryptionKey?.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'Allow Guardduty to use the key',
      principals: [new iam.ServicePrincipal('guardduty.amazonaws.com')],
      actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
      resources: ['*'],
    }),
  );
}

export async function getValidRegions(config: AcceleratorConfig) {
  const regions = config['global-options']['supported-regions'];
  const excl = config['global-options']['central-security-services']['guardduty-excl-regions'];
  const validRegions = regions.filter(x => !excl?.includes(x));
  return validRegions;
}
