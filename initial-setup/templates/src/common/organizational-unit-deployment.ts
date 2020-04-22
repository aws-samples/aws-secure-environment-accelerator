import * as cdk from '@aws-cdk/core';
import { OrganizationalUnitConfig, AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '../common/vpc';
import { Account } from '../utils/accounts';
import { MandatoryAccountDeployment } from './mandatory-account-deployment';
import { Context } from '../utils/context';

export interface OrganizationalUnitDeploymentProps {
  acceleratorConfig: AcceleratorConfig;
  context: Context;
  /**
   * The accounts in the organization.
   */
  accounts: Account[];
  /**
   * The OU key for the organizational unit.
   */
  ouKey: string;
  /**
   * The organizational unit config to use for this deployment.
   */
  ouConfig: OrganizationalUnitConfig;
  /**
   * The mandatory account deployments. These are needed to deploy VPCs into the accounts.
   */
  mandatoryAccountDeployments: { [accountKey: string]: MandatoryAccountDeployment };
}

/**
 * Auxiliary construct that creates VPCs for organizational units.
 */
export class OrganizationalUnitDeployment extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: OrganizationalUnitDeploymentProps) {
    super(scope, id);

    const { accounts, ouKey, ouConfig, mandatoryAccountDeployments: deployments } = props;

    const vpcConfig = ouConfig?.vpc;
    const deploy = vpcConfig?.deploy;
    if (!vpcConfig) {
      console.log(`Skipping VPC creation for organizational unit "${ouKey}"`);
    } else if (!deploy) {
      console.warn(`Skipping VPC creation for organizational unit "${ouKey}" as 'deploy' is not set`);
    } else if (deploy === 'local') {
      // If the deployment is 'local' then the VPC should be created in all the accounts in this OU

      // Only deploy local VPCs for accounts in the OU
      const entries = Object.entries(deployments).filter(([_, deployment]) => deployment.accountConfig.ou === ouKey);

      for (const [accountKey, deployment] of entries) {
        console.debug(`Deploying local VPC for organizational unit "${ouKey}" in account "${accountKey}"`);

        new Vpc(deployment.vpcStack, vpcConfig.name, {
          accounts,
          vpcConfig,
          organizationalUnitName: ouKey,
        });
      }
    } else {
      // If the deployment is not 'local' then the VPC should be created in the given account
      const accountKey = deploy;
      console.debug(`Deploying non-local VPC for organizational unit "${ouKey}" in account "${accountKey}"`);

      const deployment = deployments[accountKey];
      const vpc = new Vpc(deployment.vpcStack, vpcConfig.name, {
        accounts,
        vpcConfig,
        organizationalUnitName: ouKey,
      });

      // Adding Output for VPC
      new cdk.CfnOutput(deployment.vpcStack, `Vpc${vpcConfig.name}`, {
        value: vpc.vpcId,
      });

      // Adding Outputs for Subnets
      for (const subnet of vpc.subnets.subnets) {
        new cdk.CfnOutput(deployment.vpcStack, `${vpcConfig.name}Subnet${subnet.subnetId}`, {
          value: subnet.subnet.ref,
        });
      }

      // Adding Outputs for RouteTables
      for (const [key, value] of vpc.routeTableNameToIdMap) {
        new cdk.CfnOutput(deployment.vpcStack, `${vpcConfig.name}RouteTable${key}`, {
          value,
        });
      }
    }
  }
}
