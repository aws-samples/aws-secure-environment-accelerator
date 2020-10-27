import mri from 'mri';
import { CdkToolkit } from './toolkit';
import * as app from './src/app';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

/**
 * Entrypoint for bootstrapping, deploying and synthesizing CDK apps.
 */
async function main() {
  const usage = `Usage: cdk.ts <command> [<command>] --phase PHASE [--region REGION] [--account-key ACCOUNT_KEY] [--parallel]`;
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
  const phase = args.phase;
  const parallel = args.parallel;
  if (phase === undefined || commands.length === 0) {
    console.log(usage);
    return;
  }

  const apps = await app.deploy({
    phaseId: `${phase}`,
    region: args.region,
    accountKey: args['account-key'],
    // Make sure templates and assets do not build in to the same directory
    useTempOutputDir: true,
  });

  const toolkit = await CdkToolkit.create(apps);

  if (commands.includes('bootstrap')) {
    await toolkit.bootstrap();
  }
  if (commands.includes('synth')) {
    await toolkit.synth();
  }
  if (commands.includes('deploy')) {
    const outputs = await toolkit.deployAllStacks({
      parallel,
    });
    console.log(outputs);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
