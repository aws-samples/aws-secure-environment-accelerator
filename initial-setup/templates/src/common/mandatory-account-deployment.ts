import * as cdk from '@aws-cdk/core';
import { AccountConfig, VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { pascalCase } from 'pascal-case';
import { Context } from 'vm';
import { Vpc } from '../common/vpc';
import { VpcStack } from '../common/vpc-stack';
import { Account, getAccountId } from '../utils/accounts';
import { FlowLogBucketReplication } from './flow-log-bucket';

export interface MandatoryAccountDeploymentProps {
  context: Context;
  /**
   * The accounts in the organization.
   */
  accounts: Account[];
  /**
   * The account key for the account.
   */
  accountKey: string;
  /**
   * The account config to use for this deployment.
   */
  accountConfig: AccountConfig;
  flowLogExpirationInDays: number;
  flowLogBucketReplication?: FlowLogBucketReplication;
}

/**
 * Auxiliary construct that creates VPCs for mandatory accounts.
 */
export class MandatoryAccountDeployment extends cdk.Construct {
  readonly accountConfig: AccountConfig;
  readonly vpcStack: VpcStack;

  constructor(scope: cdk.Construct, id: string, props: MandatoryAccountDeploymentProps) {
    super(scope, id);

    const { context, accounts, accountKey, flowLogExpirationInDays, flowLogBucketReplication } = props;

    this.accountConfig = props.accountConfig;

    this.vpcStack = new VpcStack(this, `VpcStack`, {
      env: {
        account: getAccountId(accounts, accountKey),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-Networking${pascalCase(accountKey)}`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      flowLogExpirationInDays,
      flowLogBucketReplication,
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
        tgwDeployment: this.accountConfig.deployments.tgw,
      });
    }
  }
}
