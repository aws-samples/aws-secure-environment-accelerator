import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import * as iam from '@aws-cdk/aws-iam';
import { pascalCase } from 'pascal-case';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { PeeringConnectionConfig, VpcConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { PeeringConnection } from '../common/peering-connection';
import { JsonOutputValue } from '../common/json-output';
import { GlobalOptionsDeployment } from '../common/global-options';
import { getAllAccountVPCConfigs, getVpcConfig } from '../common/get-all-vpcs';
import { VpcOutput } from './phase-1';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as ec2 from '@aws-cdk/aws-ec2';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const app = new cdk.App();
  const rolesForPeering: string[] = [];

  /**
   * Creates IAM Role in source Account and provide assume permisions to target acceleratorExecutionRole
   * @param roleName : Role Name forpeering connection from source to target
   * @param sourceAccount : Source Account Key, Role will be created in this
   * @param accountKey : Target Account Key, Access will be provided to this accout
   */
  const createIamRole = (roleName: string, sourceAccount: string, targetAccount: string) => {
    
    if (rolesForPeering.includes(roleName)) {
      return;
    }
    const iamRolePeering = new AcceleratorStack(app, `PBMMAccel-B-${roleName}Stack`, {
      env: {
        account: getAccountId(accounts, sourceAccount),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-B-${roleName}Stack`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
    });

    const peeringRole = new iam.Role(iamRolePeering, roleName, {
      roleName,
      assumedBy: new iam.ArnPrincipal(
          `arn:aws:iam::${getAccountId(accounts, targetAccount)}:role/${context.acceleratorExecutionRoleName}`)
    });

    peeringRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['ec2:AcceptVpcPeeringConnection'],
      }),
    );
    rolesForPeering.push(roleName);
    return;
  };

  /**
   * Code to create DNS Resolvers
   */
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const deployment = new AcceleratorStack(app, 'PBMMAccel-A-GlobalOptionsDNSResolversStack', {
    env: {
      account: getAccountId(accounts, zonesAccountKey),
      region: cdk.Aws.REGION,
    },
    stackName: `PBMMAccel-A-GlobalOptionsDNSResolvers`,
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
  });

  new GlobalOptionsDeployment(deployment, `GlobalOptionsDNSResolvers`, {
    accounts,
    outputs,
    context,
    acceleratorConfig,
  });

  /**
   * Code to create Peering Connection in all accounts
   */

  // Retrive all Account Configs
  const accountConfigs = getAllAccountVPCConfigs(acceleratorConfig);
  for (const [account, accountConfig] of Object.entries(accountConfigs)) {
    const peeringConfig = PeeringConnection.getVpcConfigForPcx(account, accountConfig);
    if (!peeringConfig) {
      continue;
    }
    const { accountKey, vpcConfig } = peeringConfig;
    const pcxConfig = vpcConfig.pcx;
    if (!PeeringConnectionConfig.is(pcxConfig)) {
      continue;
    }
    const pcxSourceVpc = pcxConfig['source-vpc'];
    const roleName = pascalCase(`VPCPeeringAccepter${accountKey}To${pcxConfig.source}`);
    createIamRole(roleName, pcxConfig.source, accountKey);
    const peerRoleArn = `arn:aws:iam::${getAccountId(accounts, pcxConfig.source)}:role/${roleName}`;

    const pcxDeployment = new AcceleratorStack(
      app,
      `PBMMAccel-C-PcxDeployment${accountKey}${pcxSourceVpc}Stack`,
      {
        env: {
          account: getAccountId(accounts, accountKey),
          region: cdk.Aws.REGION,
        },
        stackName: `PBMMAccel-C-PcxDeployments${accountKey}${vpcConfig.name}Stack`,
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
      },
    );

    // Get Peer VPC Configuration
    const peerVpcConfig = getVpcConfig(accountConfigs, pcxConfig.source, pcxSourceVpc);
    if (!VpcConfigType.is(peerVpcConfig)) {
      throw new Error(`No configuration found for Peer VPC "${pcxSourceVpc}"`);
    }
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      throw new Error(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
    }
    const peerVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey: pcxConfig.source,
      outputType: 'VpcOutput',
    });
    const peerVpcOutout = peerVpcOutputs.find(x => x.vpcName === pcxSourceVpc);
    if (!peerVpcOutout) {
      throw new Error(`No VPC Found in outputs for VPC name "${pcxSourceVpc}"`);
    }
    const peerOwnerId = getAccountId(accounts, pcxConfig.source);
    
    const pcx = new ec2.CfnVPCPeeringConnection(
      pcxDeployment,
      `${vpcConfig.name}-${pcxSourceVpc}_pcx`,{
        vpcId: vpcOutput.vpcId,
        peerVpcId: peerVpcOutout.vpcId,
        peerRoleArn,
        peerOwnerId,
      },
    );

    vpcOutput.pcx = pcx.ref;

    // Store the VPC output so that subsequent phases can access the output
    new JsonOutputValue(pcxDeployment, `VpcOutput`, {
      type: 'VpcOutput',
      // tslint:disable-next-line deprecation
      value: vpcOutput,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
