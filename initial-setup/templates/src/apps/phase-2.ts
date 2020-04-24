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
  AccountConfig,
  OrganizationalUnitConfig,
  VpcConfigType,
  AcceleratorConfig,
} from '@aws-pbmm/common-lambda/lib/config';
import { PeeringConnectionDeployment, PeeringConnection } from '../common/peering-connection';
import { JsonOutputValue } from '../common/json-output';
import { GlobalOptionsDeployment } from '../common/global-options';

interface VpcConfigs {
  [key: string]: AccountConfig | OrganizationalUnitConfig;
}

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
    const iamRolePeering = new AcceleratorStack(app, `${roleName}Stack`, {
      env: {
        account: getAccountId(accounts, sourceAccount),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-${roleName}Stack`,
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

  /**
   * Returns all VPC Configs in both Mandatory account configs and oranizational units
   * @param acceleratorConfig Full Configuration Details
   */
  const getAllAccountVPCConfigs = (config: AcceleratorConfig): VpcConfigs => {
    const mandatoryAccountConfig = config['mandatory-account-configs'];
    const orgaizationalUnitsConfig = config['organizational-units'];
    const accConfigs: VpcConfigs = {};
    for (const [key, value] of Object.entries(mandatoryAccountConfig)) {
      if (value && value?.vpc) {
        accConfigs[key] = value;
      }
    }
    for (const [key, value] of Object.entries(orgaizationalUnitsConfig)) {
      if (value && value?.vpc) {
        accConfigs[key] = value;
      }
    }
    return accConfigs;
  };

  // Retrive all Account Configs
  const accountConfigs = getAllAccountVPCConfigs(acceleratorConfig);

  /**
   * Code to create DNS Resolvers
   */
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const deployment = new AcceleratorStack(app, 'GlobalOptionsDNSResolversStack', {
    env: {
      account: getAccountId(accounts, zonesAccountKey),
      region: cdk.Aws.REGION,
    },
    stackName: `PBMMAccel-GlobalOptionsDNSResolvers`,
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
    if (!rolesForPeering.includes(roleName)) {
      const roleStatus = createIamRole(roleName, pcxConfig.source, accountKey);
      rolesForPeering.push(roleName);
    }
    const peerRoleArn = `arn:aws:iam::${getAccountId(accounts, pcxConfig.source)}:role/${roleName}`;

    const pcxDeployment = new AcceleratorStack(app, `PcxDeployment${accountKey}${pcxConfig['source-vpc']}Stack`, {
      env: {
        account: getAccountId(accounts, accountKey),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-PcxDeployment${accountKey}${vpcConfig.name}Stack`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
    });

    // Get Peer VPC Configuration
    const peerVpcConfig = getVpcConfig(accountConfigs, pcxConfig.source, pcxConfig['source-vpc']);
    if (!VpcConfigType.is(peerVpcConfig)) {
      throw new Error(`No configuration found for Peer VPC "${pcxConfig['source-vpc']}"`);
    }

    const pcx = new PeeringConnectionDeployment(
      pcxDeployment,
      `PcxDeployment${pcxConfig.source}${pcxConfig['source-vpc']}`,
      {
        vpcConfig,
        peerVpcConfig,
        accounts,
        accountKey,
        context,
        outputs,
        peerRoleArn,
      },
    );

    // Store the VPC output so that subsequent phases can access the output
    const jsonop = new JsonOutputValue(pcxDeployment, `VpcOutput`, {
      type: 'VpcOutput',
      // tslint:disable-next-line deprecation
      value: pcx.vpcOutput,
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
