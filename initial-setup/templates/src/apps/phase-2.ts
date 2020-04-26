import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import * as iam from '@aws-cdk/aws-iam';
import { pascalCase } from 'pascal-case';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import {
  PeeringConnectionConfig,
  VpcConfig,
  VpcConfigType,
} from '@aws-pbmm/common-lambda/lib/config';
import { PeeringConnection } from '../common/peering-connection';
import { JsonOutputValue } from '../common/json-output';
import { GlobalOptionsDeployment } from '../common/global-options';
import { getAllAccountVPCConfigs, VpcConfigs } from '../common/get-all-vpcs';
import { VpcOutput } from './phase-1';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

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

  /**
   * Creates IAM Role in source Account and provide assume permisions to target acceleratorExecutionRole
   * @param roleName : Role Name forpeering connection from source to target
   * @param sourceAccount : Source Account Key, Role will be created in this
   * @param accountKey : Target Account Key, Access will be provided to this accout
   */
  const createIamRole = (roleName: string, sourceAccount: string, targetAccount: string): string => {
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
      assumedBy: new iam.CompositePrincipal(
        new iam.ArnPrincipal(
          `arn:aws:iam::${getAccountId(accounts, targetAccount)}:role/${context.acceleratorExecutionRoleName}`,
        ), // AccountPrincipal(getAccountId(accounts, accountKey))
      ),
    });

    peeringRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['ec2:AcceptVpcPeeringConnection'],
      }),
    );
    return 'SUCCESS';
  };

  // Retrive all Account Configs
  const accountConfigs = getAllAccountVPCConfigs(acceleratorConfig);

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
  const rolesForPeering: string[] = [];
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
    const roleName = pascalCase(`VPCPeeringAccepter${accountKey}To${pcxConfig.source}`);
    let roleStatus;
    if (!rolesForPeering.includes(roleName)) {
      roleStatus = createIamRole(roleName, pcxConfig.source, accountKey);
      rolesForPeering.push(roleName);
    } else {
      roleStatus = 'SUCCESS';
    }
    const peerRoleArn = `arn:aws:iam::${getAccountId(accounts, pcxConfig.source)}:role/${roleName}`;

    const pcxDeployment = new AcceleratorStack(
      app,
      `PBMMAccel-C-PcxDeployment${accountKey}${pcxConfig['source-vpc']}Stack`,
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
    const peerVpcConfig = getVpcConfig(accountConfigs, pcxConfig.source, pcxConfig['source-vpc']);
    if (!VpcConfigType.is(peerVpcConfig)) {
      throw new Error(`No configuration found for Peer VPC "${pcxConfig['source-vpc']}"`);
    }
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    if (!vpcOutput){
      throw new Error(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
    }
    const peerVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey: pcxConfig.source,
      outputType: 'VpcOutput',
    });
    const peerVpcOutout = peerVpcOutputs.find(x => x.vpcName === pcxConfig["source-vpc"]);
    if (!peerVpcOutout){
      throw new Error(`No VPC Found in outputs for VPC name "${pcxConfig["source-vpc"]}"`);
    }
    const peerOwnerId = getAccountId(accounts, pcxConfig.source);
    const pcx = new PeeringConnection.PeeringConnectionDeployment(
      pcxDeployment,
      `${vpcConfig.name}-${pcxConfig['source-vpc']}_pcx`,
      {
        vpcId: vpcOutput.vpcId,
        peerVpcId: peerVpcOutout.vpcId,
        peerRoleArn,
        peerOwnerId
      },
    );
    vpcOutput.pcx = pcx.pcxId;

    // Store the VPC output so that subsequent phases can access the output
    const jsonop = new JsonOutputValue(pcxDeployment, `VpcOutput`, {
      type: 'VpcOutput',
      // tslint:disable-next-line deprecation
      value: vpcOutput,
    });
  }
}

export function getVpcConfig(accountConfigs: VpcConfigs, accountKey: string, vpcName: string): VpcConfig | undefined {
  const vpcConfig = Object.entries(accountConfigs).find(
    x =>
      (x[0] === accountKey && x[1].vpc && x[1].vpc.name === vpcName) ||
      (x[1].vpc && x[1].vpc.deploy === accountKey && x[1].vpc.name === vpcName),
  )?.[1].vpc;
  return vpcConfig;
}
// tslint:disable-next-line: no-floating-promises
main();
