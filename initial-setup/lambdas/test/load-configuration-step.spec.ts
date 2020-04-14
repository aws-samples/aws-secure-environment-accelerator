import * as mocks from './load-configuration-step.mocks'; // IMPORTANT! Load the mocks _before_ the module under test!
import { handler } from '../src/load-configuration-step';

beforeEach(() => {
  // Reset the mocks before every test
  reset();
});

test('the handler should be successfully return when the configuration is correct', async () => {
  const result = await handler({
    configSecretSourceId: 'accelerator/config',
    configSecretInProgressId: 'accelerator/in-progress-config',
  });

  expect(result.accounts).toHaveLength(5);
  expect(result.accounts).toMatchObject([
    {
      accountKey: 'primary-key',
      accountName: 'primary',
      emailAddress: 'lz@amazon.com',
      landingZoneAccountType: 'primary',
      organizationalUnit: 'core',
    },
    {
      accountKey: 'shared-network-key',
      accountName: 'shared-network',
      emailAddress: 'lz+shared-network@amazon.com',
      landingZoneAccountType: undefined,
      organizationalUnit: 'core',
    },
    {
      accountKey: 'security-account-key',
      accountName: 'security',
      emailAddress: 'lz+security@amazon.com',
      landingZoneAccountType: 'security',
      organizationalUnit: 'core',
    },
    {
      accountKey: 'log-archive-key',
      accountName: 'log-archive',
      emailAddress: 'lz+log-archive@amazon.com',
      landingZoneAccountType: 'log-archive',
      organizationalUnit: 'core',
    },
    {
      accountKey: 'shared-services-key',
      accountName: 'shared-services',
      emailAddress: 'lz+shared-services@amazon.com',
      landingZoneAccountType: 'shared-services',
      organizationalUnit: 'core',
    },
  ]);
});

test('the handler should throw an error when the Accelerator config email does not match the account email', async () => {
  // @ts-ignore
  mocks.values.acceleratorConfig['mandatory-account-configs']['shared-network-key'].email = 'another@email.com';

  expect.assertions(1);
  try {
    await handler({
      configSecretSourceId: 'accelerator/config',
      configSecretInProgressId: 'accelerator/in-progress-config',
    });
  } catch (e) {
    expect(e.message).toMatch('does not match the email in the Accelerator configuration');
  }
});

test('the handler should throw an error when a Landing Zone account is missing', async () => {
  // Remove the security account
  // @ts-ignore
  mocks.values.organizationalUnitAccounts['core-ou-id'].splice(1);

  expect.assertions(2);
  try {
    await handler({
      configSecretSourceId: 'accelerator/config',
      configSecretInProgressId: 'accelerator/in-progress-config',
    });
  } catch (e) {
    expect(e.message).toMatch('Cannot find non-primary account with name "security" that is used by Landing Zone');
    expect(e.message).toMatch('Could not find Landing Zone account of type "security"');
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
            email: 'lz@amazon.com',
            ssm_parameters: [
              {
                name: '/org/primary/account_id',
                value: '$[AccountId]',
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
    'global-options': {
      accounts: {
        'lz-primary-account': 'primary-key',
        'lz-security-account': 'security-account-key',
        'lz-log-archive-account': 'log-archive-key',
        'lz-shared-services-account': 'shared-services-key',
      },
    },
    'mandatory-account-configs': {
      'primary-key': {
        ou: 'core',
        'account-name': 'primary',
        email: 'lz@amazon.com',
      },
      'shared-network-key': {
        ou: 'core',
        'account-name': 'shared-network',
        email: 'lz+shared-network@amazon.com',
      },
    },
  };
}
