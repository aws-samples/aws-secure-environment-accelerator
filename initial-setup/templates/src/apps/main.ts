import * as cdk from '@aws-cdk/core';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { AccountConfig, OrganizationalUnitConfig, VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { pascalCase } from 'pascal-case';
import { Context } from 'vm';
import { Vpc } from '../common/vpc';
import { Account, getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { throws } from 'assert';
import { FlowLogBucket } from '../common/flow-log-bucket';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();

  // const logArchiveAccountId = getAccountId(accounts, 'log-archive');
  // const logArchiveS3BucketArn = getStackOutput(outputs, 'log-archive', 's3BucketArn');
  // const logArchiveS3KmsKeyArn = getStackOutput(outputs, 'log-archive', 's3KmsKeyArn');

  const app = new cdk.App();

  // const accountStacks: { [accountKey: string]: AcceleratorStack } = {};
  // const getVpcStackForAccount = (accountKey: string): AcceleratorStack => {
  //   if (accountStacks[accountKey]) {
  //     return accountStacks[accountKey];
  //   }

  //   const name = pascalCase(accountKey);
  //   const stack = new AcceleratorStack(app, `Networking${name}`, {
  //     env: {
  //       account: getAccountId(accounts, accountKey),
  //       region: cdk.Aws.REGION,
  //     },
  //     stackName: `PBMMAccel-Networking${name}`,
  //     acceleratorName: context.acceleratorName,
  //     acceleratorPrefix: context.acceleratorPrefix,
  //   });

  //   accountStacks[accountKey] = stack;
  //   return stack;
  // };

  // Create all the VPCs for the mandatory accounts
  const mandatoryAccountDeployments: { [accountKey: string]: MandatoryAccountDeployment } = {};
  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const name = pascalCase(accountKey);
    const deployment = new MandatoryAccountDeployment(app, name, {
      context,
      accounts,
      accountKey,
      accountConfig,
    });
    mandatoryAccountDeployments[accountKey] = deployment;
  }

  // Create all the VPCs for the organizational units
  const organizationalUnits = acceleratorConfig['organizational-units'];
  for (const [ouKey, ouConfig] of Object.entries(organizationalUnits)) {
    new OrganizationalUnitDeployment(app, ouKey, {
      context,
      accounts,
      ouKey,
      ouConfig,
      mandatoryAccountDeployments,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();

export type VpcStackProps = AcceleratorStackProps;

export class VpcStack extends AcceleratorStack {
  flowLogBucket: FlowLogBucket | undefined;

  constructor(scope: cdk.Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);
  }

  getOrCreateFlowLogBucket(): FlowLogBucket {
    if (!this.flowLogBucket) {
      this.flowLogBucket = new FlowLogBucket(this, 'FlowLogBucket', {
        // TODO From props
        expirationInDays: 30,
      });
    }
    return this.flowLogBucket;
  }
}

interface MandatoryAccountDeploymentProps {
  context: Context;
  accounts: Account[];
  accountKey: string;
  accountConfig: AccountConfig;
}

class MandatoryAccountDeployment extends cdk.Construct {
  readonly accountConfig: AccountConfig;
  readonly vpcStack: VpcStack;

  constructor(scope: cdk.Construct, id: string, props: MandatoryAccountDeploymentProps) {
    super(scope, id);

    const { context, accounts, accountKey } = props;

    this.accountConfig = props.accountConfig;

    this.vpcStack = new VpcStack(this, `VpcStack`, {
      env: {
        account: getAccountId(accounts, accountKey),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-Networking${pascalCase(accountKey)}`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
    });

    const vpcConfig: VpcConfig | undefined = this.accountConfig.vpc;
    if (!vpcConfig) {
      console.log(`Skipping VPC creation for account "${accountKey}"`);
    } else if (vpcConfig.deploy !== 'local') {
      console.warn(`Skipping non-local VPC deployment for mandatory account "${accountKey}"`);
    } else {
      console.debug(`Deploying VPC in account "${accountKey}"`);

      new Vpc(this.vpcStack, vpcConfig.name, {
        accounts,
        vpcConfig,
      });
    }
  }
}

interface OrganizationalUnitDeploymentProps {
  context: Context;
  accounts: Account[];
  ouKey: string;
  ouConfig: OrganizationalUnitConfig;
  mandatoryAccountDeployments: { [accountKey: string]: MandatoryAccountDeployment };
}

class OrganizationalUnitDeployment extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: OrganizationalUnitDeploymentProps) {
    super(scope, id);

    const { accounts, ouKey, ouConfig, mandatoryAccountDeployments } = props;

    const vpcConfig = ouConfig?.vpc;
    const deploy = vpcConfig?.deploy;
    if (!vpcConfig) {
      console.log(`Skipping VPC creation for organizational unit "${ouKey}"`);
    } else if (!deploy) {
      console.warn(`Skipping VPC creation for organizational unit "${ouKey}" as 'deploy' is not set`);
    } else if (deploy === 'local') {
      // If the deployment is 'local' then the VPC should be created in all the accounts in this OU
      for (const [accountKey, accountDeployment] of Object.entries(mandatoryAccountDeployments)) {
        if (accountDeployment.accountConfig.ou !== ouKey) {
          // Skip OU VPC deployment if the account is not in the OU
          continue;
        }

        console.debug(`Deploying local VPC for organizational unit "${ouKey}" in account "${accountKey}"`);

        new Vpc(accountDeployment.vpcStack, vpcConfig.name, {
          accounts,
          vpcConfig,
          organizationalUnitName: ouKey,
        });
      }
    } else {
      // If the deployment is not 'local' then the VPC should be created in the given account
      const accountKey = deploy;
      console.debug(`Deploying non-local VPC for organizational unit "${ouKey}" in account "${accountKey}"`);

      const accountDeployment = mandatoryAccountDeployments[accountKey];
      new Vpc(accountDeployment.vpcStack, vpcConfig.name, {
        accounts,
        vpcConfig,
        organizationalUnitName: ouKey,
      });
    }
  }
}
