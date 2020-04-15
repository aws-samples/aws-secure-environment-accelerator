import * as cdk from '@aws-cdk/core';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { GlobalOptions } from '../global-options/stack';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { getStackOutput, loadStackOutputs } from '../utils/outputs';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  

  const globalOptionsConfig = acceleratorConfig['global-options'];

  // TODO Get these values dynamically
  const zonesConfig = globalOptionsConfig.zones;
  const [ zoneAccount, resolverVpc, resolverSubnet ] = [ zonesConfig.account, zonesConfig["resolver-vpc"], zonesConfig["resolver-subnet"]];
  const zonesCreationAccountId = getAccountId(accounts, zoneAccount);
  const resolverVpcId = getStackOutput(outputs, zonesConfig.account, `Vpc${resolverVpc}`);
  let subnets: string[] = [];
  // const zoneAccountVpcConfig = (acceleratorConfig["mandatory-account-configs"] as any)[zoneAccount].vpc!;
  try{
    for(let azCount = 1; true; azCount++){
        subnets.push(getStackOutput(outputs, zonesConfig.account, `${resolverVpc}Subnet${resolverSubnet}az${azCount}`));
    }
  }catch(error){
      console.log("No more Subnets available");
  }
  const resolverSubnetId = subnets.join(',');

  zonesConfig["resolver-vpc"] = resolverVpcId as NonEmptyString;
  zonesConfig["resolver-subnet"] = resolverSubnetId as NonEmptyString;

  const app = new cdk.App();

  new GlobalOptions.Stack(app, 'GlobalOptions', {
    env: {
      account: zonesCreationAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-GlobalOptions',
    zonesConfig,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', context.acceleratorName);

  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
}

// tslint:disable-next-line: no-floating-promises
main();
