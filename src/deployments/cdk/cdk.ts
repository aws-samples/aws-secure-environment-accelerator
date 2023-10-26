import mri from 'mri';
import { CdkToolkit } from './toolkit';
import * as app from './src/app';
import microstats from 'microstats';
import * as v8 from 'v8';
const fs = require('fs').promises;

// eslint-disable-next-line
const PAGE_SIZE = parseInt(process.env.DEPLOY_STACK_PAGE_SIZE ?? '') || 850;

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
microstats.on('memory', function (value: any) {
  console.log('MEMORY:', value);
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
microstats.on('disk', function (value: any) {
  console.log('DISK:', value);
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
microstats.on('cpu', function (value: any) {
  console.log('CPU:', value);
});
const microstatsOptions = {
  frequency: 'onalert',
  memoryalert: { used: '>80%' },
  cpualert: { load: '>90%' },
  diskalert: { used: '>70%' },
};
/**
 * Entrypoint for bootstrapping, deploying and synthesizing CDK apps.
 */

const convertToMegabytes = (num: number) => {
  return `${(num / 1024 / 1024).toFixed(2)} MB`;
};

const getHeapStatistics = () => {
  const heapstats = v8.getHeapStatistics();

  return {
    totalHeapSize: convertToMegabytes(heapstats.total_heap_size),
    totalHeapSizeExecutable: convertToMegabytes(heapstats.total_heap_size_executable),
    totalPhysicalSize: convertToMegabytes(heapstats.total_physical_size),
    totalAvailableSize: convertToMegabytes(heapstats.total_available_size),
    usedHeapSize: convertToMegabytes(heapstats.used_heap_size),
    heapSizeLimit: convertToMegabytes(heapstats.heap_size_limit),
    usedHeapSizePercentage: ((heapstats.used_heap_size / heapstats.heap_size_limit) * 100).toFixed(2),
    mallocedMemory: convertToMegabytes(heapstats.malloced_memory),
    peakMallocedMemory: convertToMegabytes(heapstats.peak_malloced_memory),
    doesZapGarbage: heapstats.does_zap_garbage,
    nativeContexts: heapstats.number_of_native_contexts,
    detachedContexts: heapstats.number_of_detached_contexts,
  };
};

async function main() {
  await fs.writeFile('/tmp/buildStatus.txt', 'started', 'utf8');
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

  const commands = args._;
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
    useTempOutputDir: true,
  });
  console.log(`Total stacks = ${apps.length}`);
  let appsPage = [];
  for (let i = 0; i < apps.length; i++) {
    appsPage.push(apps[i]);
    console.log(`deploying stack ${i + 1} of ${apps.length}`);
    if (appsPage.length > PAGE_SIZE - 1 || i === apps.length - 1) {
      const toolkit = await CdkToolkit.create(appsPage);
      if (commands.includes('bootstrap')) {
        await toolkit.bootstrap();
      }
      if (commands.includes('synth')) {
        await toolkit.synth();
      }
      if (commands.includes('deploy')) {
        await toolkit.deployAllStacks({
          parallel,
        });
      }
      appsPage = [];
    }
  }
  await fs.writeFile('/tmp/buildStatus.txt', 'complete', 'utf8');
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
