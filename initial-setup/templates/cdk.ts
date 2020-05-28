import mri from 'mri';
import { ToolkitFactory } from './toolkit';
import { app as mainApp } from './src/app';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const usage = `Usage: cdk.ts <command> --phase PHASE [--region REGION] [--account-key ACCOUNT_KEY]`;
  const args = mri(process.argv.slice(2), {
    alias: {
      p: 'phase',
      r: 'region',
      a: 'account-key',
      account: 'account-key',
    },
  });

  const commands = args['_'];
  const command = commands?.[0];
  const phase = args.phase;
  if (phase === undefined || command === undefined) {
    console.log(usage);
    return;
  }

  const app = await mainApp({
    phase: `${phase}`,
    region: args.region,
    accountKey: args['account-key'],
  });

  const toolkitFactory = await ToolkitFactory.initialize();
  const toolkit = toolkitFactory.createToolkit(app);

  if (command === 'bootstrap') {
    await toolkit.bootstrap();
  } else if (command === 'deploy') {
    // const stackOutputs = await toolkit.deployAllStacks();
    // console.log(stackOutputs);
    const stackOutputs = await toolkit.deployAllStacks();
  } else if (command === 'synth') {
    await toolkit.synth();
  }
}

// tslint:disable-next-line: no-floating-promises
main();
