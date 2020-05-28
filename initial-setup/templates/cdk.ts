import mri from 'mri';
import { ToolkitFactory } from './toolkit';
import * as app from './src/app';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

/**
 * Entrypoint for bootstrapping, deploying and synthesizing CDK apps.
 */
async function main() {
  const usage = `Usage: cdk.ts <command> --phase PHASE [--region REGION] [--account-key ACCOUNT_KEY]`;
  const args = mri(process.argv.slice(2), {
    boolean: ['parallel'],
    alias: {
      p: 'phase',
      r: 'region',
      a: 'account-key',
      account: 'account-key',
    },
    default: {
      parallel: false,
    },
  });

  const commands = args['_'];
  const command = commands?.[0];
  const phase = args.phase;
  if (phase === undefined || command === undefined) {
    console.log(usage);
    return;
  }

  const cdkApp = await app.deploy({
    phase: `${phase}`,
    region: args.region,
    accountKey: args['account-key'],
  });

  const toolkitFactory = await ToolkitFactory.initialize();
  const toolkit = toolkitFactory.createToolkit(cdkApp);

  if (command === 'bootstrap') {
    await toolkit.bootstrap();
  } else if (command === 'deploy') {
    await toolkit.deployAllStacks({
      parallel: args.parallel,
    });
  } else if (command === 'synth') {
    await toolkit.synth();
  }
}

// tslint:disable-next-line: no-floating-promises
main();
