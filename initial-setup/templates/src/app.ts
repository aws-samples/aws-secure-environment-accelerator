import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SharedNetwork } from './shared-network/stack';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { OrganizationalUnit } from './organizational-units/stack'

export namespace App {
  export interface Props extends cdk.AppProps {
    acceleratorName: string;
    acceleratorConfig: AcceleratorConfig;
    accounts: { key: string; id: string }[];
  }
}

export class App extends cdk.App {
  constructor(props: App.Props) {
    super();

    const { acceleratorName, acceleratorConfig, accounts } = props;
    const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];

    // TODO Get these values dynamically
    const sharedNetworkAccountId = accounts.find((a) => a.key === 'shared-network')?.id;
    const sharedNetworkConfig = mandatoryAccountConfig['shared-network'];

    new SharedNetwork.Stack(this, 'SharedNetwork', {
      env: {
        account: sharedNetworkAccountId,
        region: cdk.Aws.REGION,
      },
      stackName: 'PBMMAccel-SharedNetwork',
      accountConfig: sharedNetworkConfig,
    });

    const organizationalUnits = acceleratorConfig['organizational-units'];
    new OrganizationalUnit.Stack(this, 'OrganizationalUnits', {
      organizationalUnits: organizationalUnits,
    });

    // Add accelerator tag to all resources
    cdk.Tag.add(this, 'Accelerator', acceleratorName);

    // Add name tag to all resources
    this.node.applyAspect(new AcceleratorNameTagger());
  }
}
