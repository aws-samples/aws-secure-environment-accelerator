import * as cdk from '@aws-cdk/core';
import { getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { pascalCase } from 'pascal-case';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { VpcStack } from '../common/vpc-stack';
import { Vpc, VpcProps } from '../common/vpc';
import { JsonOutputValue } from '../common/json-output';
import {
  OUTPUT_LOG_ARCHIVE_BUCKET_ARN,
  OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN,
  OUTPUT_LOG_ARCHIVE_ACCOUNT_ID,
} from './phase-0';
import { TransitGateway } from '../common/transit-gateway';
import { TransitGatewayAttachment } from '../common/transit-gateway-attachment';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

export interface VpcSubnetOutput {
  subnetId: string;
  subnetName: string;
  az: string;
}

export interface VpcOutput {
  vpcId: string;
  vpcName: string;
  subnets: VpcSubnetOutput[];
  routeTables: object;
}

/**
 * This is the main entry point to deploy phase 1.
 *
 * The following resources are deployed in phase 1:
 *   - Vpc
 *   - Subnets
 *   - Subnet sharing (RAM)
 *   - Route tables
 *   - Transit gateways
 *   - Internet gateways
 *   - NAT gateways
 *   - Interface endpoints
 *   - Gateway endpoints
 *   - Flow logs
 */
async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const globalOptions = acceleratorConfig['global-options'];

  const logArchiveAccountId = getStackOutput(outputs, 'log-archive', OUTPUT_LOG_ARCHIVE_ACCOUNT_ID);
  const logArchiveS3BucketArn = getStackOutput(outputs, 'log-archive', OUTPUT_LOG_ARCHIVE_BUCKET_ARN);
  const logArchiveS3KmsKeyArn = getStackOutput(outputs, 'log-archive', OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN);

  const app = new cdk.App();

  const vpcStacks: { [accountKey: string]: VpcStack } = {};
  const transitGateways = new Map<string, TransitGateway>();

  // Auxiliary method to create a VPC stack the account with given account key
  // Only one VPC stack per account is created
  const getVpcStack = (accountKey: string): VpcStack => {
    const accountId = getAccountId(accounts, accountKey);
    if (vpcStacks[accountId]) {
      return vpcStacks[accountId];
    }

    const accountKeyPascalCase = pascalCase(accountKey);
    const vpcStack = new VpcStack(app, `VpcStack${accountKeyPascalCase}`, {
      env: {
        account: accountId,
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-Networking${accountKeyPascalCase}`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      flowLogBucket: {
        expirationInDays: globalOptions['central-log-retention'],
        replication: {
          accountId: logArchiveAccountId,
          bucketArn: logArchiveS3BucketArn,
          kmsKeyArn: logArchiveS3KmsKeyArn,
        },
      },
    });
    vpcStacks[accountId] = vpcStack;
    return vpcStack;
  };

  // Auxiliary method to create a VPC in the account with given account key
  const createVpc = (accountKey: string, props: VpcProps) => {
    const vpcStack = getVpcStack(accountKey);
    const vpc = new Vpc(vpcStack, props.vpcConfig.name, props);

    // Prepare the output for next phases
    const vpcOutput: VpcOutput = {
      vpcId: vpc.vpcId,
      vpcName: props.vpcConfig.name,
      subnets: vpc.azSubnets.subnets.map(s => ({
        subnetId: s.subnet.ref,
        subnetName: s.subnetName,
        az: s.az,
      })),
      routeTables: vpc.routeTableNameToIdMap.entries(),
    };

    // Store the VPC output so that subsequent phases can access the output
    new JsonOutputValue(vpc, `VpcOutput`, {
      type: 'VpcOutput',
      value: vpcOutput,
    });

    const tgwDeployment = props.tgwDeployment;
    if (tgwDeployment) {
      const tgw = new TransitGateway(vpcStack, tgwDeployment.name!, tgwDeployment);
      transitGateways.set(tgwDeployment.name!, tgw);
    }

    const tgwAttach = props.vpcConfig['tgw-attach'];
    if (tgwAttach) {
      const tgwName = tgwAttach['associate-to-tgw'];
      const tgw = transitGateways.get(tgwName);
      if (tgw && tgwName.length > 0) {
        const attachConfig = props.vpcConfig['tgw-attach']!;

        const attachSubnetsConfig = attachConfig['attach-subnets'] || [];
        const associateConfig = attachConfig['tgw-rt-associate'] || [];
        const propagateConfig = attachConfig['tgw-rt-propagate'] || [];

        const subnetIds = attachSubnetsConfig.flatMap(
          subnet => vpc.azSubnets.getAzSubnetIdsForSubnetName(subnet) || [],
        );
        const tgwRouteAssociates = associateConfig.map(route => tgw.getRouteTableIdByName(route)!);
        const tgwRoutePropagates = propagateConfig.map(route => tgw.getRouteTableIdByName(route)!);

        // Attach VPC To TGW
        new TransitGatewayAttachment(vpcStack, 'TgwAttach', {
          vpcId: vpc.vpcId,
          subnetIds,
          transitGatewayId: tgw.tgwId,
          tgwRouteAssociates,
          tgwRoutePropagates,
        });
      }
    }
  };

  // Create all the VPCs for the mandatory accounts
  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const vpcConfig = accountConfig.vpc;
    if (!vpcConfig) {
      console.log(`Skipping VPC creation for account "${accountKey}"`);
      continue;
    }
    if (vpcConfig.deploy !== 'local') {
      console.warn(`Skipping non-local VPC deployment for mandatory account "${accountKey}"`);
      continue;
    }

    console.debug(`Deploying VPC in account "${accountKey}"`);
    createVpc(accountKey, {
      accounts,
      vpcConfig,
      tgwDeployment: accountConfig.deployments?.tgw,
    });
  }

  // Create all the VPCs for the organizational units
  const organizationalUnits = acceleratorConfig['organizational-units'];
  for (const [ouKey, ouConfig] of Object.entries(organizationalUnits)) {
    const vpcConfig = ouConfig?.vpc;
    if (!vpcConfig) {
      console.log(`Skipping VPC creation for organizational unit "${ouKey}"`);
      continue;
    }
    if (!vpcConfig.deploy) {
      console.warn(`Skipping VPC creation for organizational unit "${ouKey}" as 'deploy' is not set`);
      continue;
    }

    if (vpcConfig.deploy === 'local') {
      // If the deployment is 'local' then the VPC should be created in all the accounts in this OU
      for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
        if (accountConfig.ou === ouKey) {
          console.debug(`Deploying local VPC for organizational unit "${ouKey}" in account "${accountKey}"`);

          createVpc(accountKey, {
            accounts,
            vpcConfig,
            organizationalUnitName: ouKey,
          });
        }
      }
    } else {
      // If the deployment is not 'local' then the VPC should be created in the given account
      const accountKey = vpcConfig.deploy;
      console.debug(`Deploying non-local VPC for organizational unit "${ouKey}" in account "${accountKey}"`);

      createVpc(accountKey, {
        accounts,
        vpcConfig,
        organizationalUnitName: ouKey,
      });
    }
  }

  // const accountVpcCount: { [accountKey: string]: number } = {};
  // for (const vpcStack of Object.values(vpcStacks)) {
  //   const vpcStackNode = constructs.Node.of(vpcStack);
  //   const children = vpcStackNode.findAll(constructs.ConstructOrder.PREORDER);
  //   for (const child of children) {
  //     if (child instanceof Vpc) {
  //       let count = accountVpcCount[vpcStack.account];
  //       if (!count) {
  //         count = 1;
  //       } else {
  //         count++;
  //       }
  //       accountVpcCount[vpcStack.account] = count;

  //       if (count > 5) {
  //         console.log(`Removing VPC "${child.name}" in account "${vpcStack.account}" to avoid going over VPC quota`);

  //         const childNode = constructs.Node.of(child);
  //         const parentNode = constructs.Node.of(childNode.scope!);
  //         parentNode.tryRemoveChild(childNode.id);
  //       }
  //     }
  //   }
  // }
}

// tslint:disable-next-line: no-floating-promises
main();
