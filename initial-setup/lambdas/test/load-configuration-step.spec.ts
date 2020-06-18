import * as mocks from './load-configuration-step.mocks'; // IMPORTANT! Load the mocks _before_ the module under test!
import { handler } from '../src/configuration/load-landing-zone-config';

beforeAll(() => {
  mocks.install();
});

beforeEach(() => {
  // Reset the mocks before every test
  reset();
});

test('the handler should be successfully return when the configuration is correct', async () => {
  const result = await handler({
    configFilePath: 'config.json',
    configRepositoryName: 'PBMMAccel-Repo-Config',
    configCommitId: 'fasdjfkhsdf',
  });

  expect(result.accounts).toHaveLength(6);

  expect(result.accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        accountKey: 'primary-key',
        accountName: 'primary',
        emailAddress: 'lz@amazon.com',
        landingZoneAccountType: 'primary',
        organizationalUnit: 'core',
      }),
      expect.objectContaining({
        accountKey: 'log-archive-key',
        accountName: 'log-archive',
        emailAddress: 'lz+log-archive@amazon.com',
        landingZoneAccountType: 'log-archive',
        organizationalUnit: 'core',
      }),
      expect.objectContaining({
        accountKey: 'security-key',
        accountName: 'security',
        emailAddress: 'lz+security@amazon.com',
        landingZoneAccountType: 'security',
        organizationalUnit: 'core',
      }),
      expect.objectContaining({
        accountKey: 'shared-services-key',
        accountName: 'shared-services',
        emailAddress: 'lz+shared-services@amazon.com',
        landingZoneAccountType: 'shared-services',
        organizationalUnit: 'core',
      }),
      expect.objectContaining({
        accountKey: 'shared-network-key',
        accountName: 'shared-network',
        emailAddress: 'lz+shared-network@amazon.com',
        landingZoneAccountType: undefined,
        organizationalUnit: 'core',
      }),
      expect.objectContaining({
        accountKey: 'operations-key',
        accountName: 'operations',
        emailAddress: 'lz+operations@amazon.com',
        landingZoneAccountType: undefined,
        organizationalUnit: 'core',
      }),
    ]),
  );
});

test('the handler should be successfully return when a mandatory account is missing', async () => {
  // Remove operations account
  const coreAccounts = mocks.values.organizationalUnitAccounts['core-ou-id'];
  const index = coreAccounts.findIndex(a => a.Name === 'operations');
  coreAccounts.splice(index);

  const result = await handler({
    configFilePath: 'config.json',
    configRepositoryName: 'PBMMAccel-Repo-Config',
    configCommitId: '',
  });

  expect(result.accounts).toHaveLength(6);
});

test('the handler should throw an error when the Accelerator config name does not match the account name', async () => {
  // @ts-ignore
  mocks.values.acceleratorConfig['mandatory-account-configs']['shared-network-key']['account-name'] = 'modified';

  expect.assertions(1);
  try {
    await handler({
      configFilePath: 'config.json',
      configRepositoryName: 'PBMMAccel-Repo-Config',
      configCommitId: 'fasdjfkhsdf',
    });
  } catch (e) {
    expect(e.message).toMatch('does not match the name in the Accelerator configuration');
  }
});

test('the handler should throw an error when the Accelerator config OU does not match the account OU', async () => {
  // @ts-ignore
  mocks.values.acceleratorConfig['mandatory-account-configs']['shared-network-key'].ou = 'applications';

  expect.assertions(1);
  try {
    await handler({
      configFilePath: 'config.json',
      configRepositoryName: 'PBMMAccel-Repo-Config',
      configCommitId: 'fasdjfkhsdf',
    });
  } catch (e) {
    expect(e.message).toMatch('is not in OU');
  }
});

test('the handler should throw an error when a Landing Zone account is missing', async () => {
  // Remove security account
  const coreAccounts = mocks.values.organizationalUnitAccounts['core-ou-id'];
  const index = coreAccounts.findIndex(a => a.Name === 'security');
  coreAccounts.splice(index);

  expect.assertions(2);
  try {
    await handler({
      configFilePath: 'config.json',
      configRepositoryName: 'PBMMAccel-Repo-Config',
      configCommitId: 'fasdjfkhsdf',
    });
  } catch (e) {
    expect(e.message).toMatch('Cannot find non-primary account with name "security" that is used by Landing Zone');
    expect(e.message).toMatch('Could not find Landing Zone account of type "security"');
  }
});

test('the handler should throw an error when Landing Zone has more organizational units than Accelerator', async () => {
  // Add an additional OU in Landing Zone config
  mocks.values.landingZoneConfig.organizational_units.push({
    name: 'sandbox',
  });

  expect.assertions(1);
  try {
    await handler({
      configFilePath: 'config.json',
      configRepositoryName: 'PBMMAccel-Repo-Config',
      configCommitId: 'fasdjfkhsdf',
    });
  } catch (e) {
    expect(e.message).toMatch(
      /There are 1 organizational units in Accelerator configuration while there are only 2 organizational units in the Landing Zone configuration/,
    );
  }
});

test('the handler should throw an error when Accelerator has more organizational units than Landing Zone', async () => {
  // Add an additional OU in Landing Zone config
  mocks.values.acceleratorConfig['organizational-units']['sandbox'] = {};

  expect.assertions(1);
  try {
    await handler({
      configFilePath: 'config.json',
      configRepositoryName: 'PBMMAccel-Repo-Config',
      configCommitId: 'fasdjfkhsdf',
    });
  } catch (e) {
    expect(e.message).toMatch(
      /There are 2 organizational units in Accelerator configuration while there are only 1 organizational units in the Landing Zone configuration/,
    );
  }
});

/**
 * Method that initialized mocked values with valid defaults.
 */
function reset() {
  mocks.values.organizationalUnits = [
    {
      Id: 'core-ou-id',
      Name: 'core',
    },
    {
      Id: 'applications-ou-id',
      Name: 'applications',
    },
  ];

  mocks.values.organizationalUnitAccounts = {
    'core-ou-id': [
      {
        Id: 'primary-account-id',
        Name: 'lz@amazon.com',
        Email: 'lz@amazon.com',
      },
      {
        Id: 'security-account-id',
        Name: 'security',
        Email: 'lz+security@amazon.com',
      },
      {
        Id: 'log-archive-account-id',
        Name: 'log-archive',
        Email: 'lz+log-archive@amazon.com',
      },
      {
        Id: 'shared-services-account-id',
        Name: 'shared-services',
        Email: 'lz+shared-services@amazon.com',
      },
      {
        Id: 'shared-network-account-id',
        Name: 'shared-network',
        Email: 'lz+shared-network@amazon.com',
      },
      {
        Id: 'operations-account-id',
        Name: 'operations',
        Email: 'lz+operations@amazon.com',
      },
    ],
    'applications-ou-id': [],
  };

  mocks.values.landingZoneConfig = {
    organizational_units: [
      {
        name: 'core',
        core_accounts: [
          {
            name: 'primary',
            ssm_parameters: [
              {
                name: '/org/primary/account_id',
                value: '$[AccountId]',
              },
              {
                name: '/org/primary/email_id',
                value: '$[AccountEmail]',
              },
            ],
          },
          {
            name: 'security',
            email: 'lz+security@amazon.com',
            ssm_parameters: [
              {
                name: '/org/member/security/account_id',
                value: '$[AccountId]',
              },
            ],
          },
          {
            name: 'log-archive',
            email: 'lz+log-archive@amazon.com',
            ssm_parameters: [
              {
                name: '/org/member/logging/account_id',
                value: '$[AccountId]',
              },
            ],
          },
          {
            name: 'shared-services',
            email: 'lz+shared-services@amazon.com',
            ssm_parameters: [
              {
                name: '/org/member/sharedservices/account_id',
                value: '$[AccountId]',
              },
            ],
          },
        ],
      },
    ],
  };

  mocks.values.acceleratorConfig = {
    'mandatory-account-configs': {
      'primary-key': {
        ou: 'core',
        'landing-zone-account-type': 'primary',
        'account-name': 'primary',
        email: 'lz@amazon.com',
      },
      'log-archive-key': {
        ou: 'core',
        'landing-zone-account-type': 'log-archive',
        'account-name': 'log-archive',
        email: 'lz+log-archive@amazon.com',
      },
      'security-key': {
        ou: 'core',
        'landing-zone-account-type': 'security',
        'account-name': 'security',
        email: 'lz+security@amazon.com',
      },
      'shared-services-key': {
        ou: 'core',
        'landing-zone-account-type': 'shared-services',
        'account-name': 'shared-services',
        email: 'lz+shared-services@amazon.com',
      },
      'shared-network-key': {
        ou: 'core',
        'account-name': 'shared-network',
        email: 'lz+shared-network@amazon.com',
      },
      'operations-key': {
        ou: 'core',
        'account-name': 'operations',
        email: 'lz+operations@amazon.com',
      },
    },
    'workload-account-configs': {},
    'organizational-units': {
      core: {},
    },
  };
}
