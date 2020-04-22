import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { ShareVpc } from '../common/share-subnets';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const organizationalUnits = acceleratorConfig['organizational-units'];

  const app = new cdk.App();

  for (const [orgKey, orgUnit] of Object.entries(organizationalUnits)) {
    // TODO Remove the below conditional block in the future when all the accounts are ready
    if (orgUnit.vpc.name !== 'Central') {
      continue;
    }

    const subnets = orgUnit.vpc.subnets!;
    for (const [key, subnet] of subnets.entries()) {
      if (subnet['share-to-specific-accounts']!.length > 0) {
        const accountId = getAccountId(accounts, orgUnit.vpc.deploy!);
        new ShareVpc.Stack(app, `ShareVPC${orgKey}${key}`, {
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
}

// tslint:disable-next-line: no-floating-promises
main();
