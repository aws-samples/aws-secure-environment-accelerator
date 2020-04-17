import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { ShareVPC } from '../common/share-subnets';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const organziationalUnits = acceleratorConfig['organizational-units'];

  const app = new cdk.App();

  for (const [orgKey, orgUnit] of Object.entries(organziationalUnits)) {
    //TODO Remove the below conditional block in the future when all the accounts are ready
    if (orgUnit.vpc.name != 'Central') {
      continue;
    }

    const subnets = orgUnit.vpc.subnets!;
    for (const [key, subnet] of subnets.entries()) {
      if (subnet['share-to-specific-accounts']!.length > 0) {
        const accountId = getAccountId(accounts, orgUnit.vpc.deploy!);
        new ShareVPC.Stack(app, `ShareVPC${orgKey}${key}`, {
          env: {
            account: accountId,
            region: cdk.Aws.REGION,
          },
          stackName: `PBMMAccel-${orgUnit.vpc.deploy!}-VPC-Sharing`,
          acceleratorName: context.acceleratorName,
          acceleratorPrefix: context.acceleratorPrefix,
          stackOutputs: outputs,
          organizationalUnit: orgUnit,
          accounts,
        });
      }
    }
  }

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', context.acceleratorName);

  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
}

// tslint:disable-next-line: no-floating-promises
main();
