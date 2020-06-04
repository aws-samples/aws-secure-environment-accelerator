// tslint:disable:no-any
import 'jest';
import * as fs from 'fs';
import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AccountStacks } from '../../src/common/account-stacks';
import { Account } from '../../src/utils/accounts';
import { Limiter } from '../../src/utils/limits';
import { PhaseInput } from '../../src/apps/shared';

/**
 * Function that returns mock input for a given phase.
 */
export function createPhaseInput(phase: string): PhaseInput {
  const accounts: Account[] = [
    {
      key: 'master',
      id: '111111111111',
      arn: 'arn:aws:organizations::111111111111:account/o-111111111111/111111111111',
      name: 'test+pbmm@amazon.com',
      email: 'test+pbmm@amazon.com',
      ou: 'core',
      type: 'primary',
    },
    {
      key: 'log-archive',
      id: '222222222222',
      arn: 'arn:aws:organizations::111111111111:account/o-222222222222/222222222222',
      name: 'test-logs',
      email: 'test+pbmm-lz-logs@amazon.com',
      ou: 'core',
      type: 'log-archive',
    },
    {
      key: 'security',
      id: '333333333333',
      arn: 'arn:aws:organizations::111111111111:account/o-333333333333/333333333333',
      name: 'test-security',
      email: 'test+pbmm-lz-security@amazon.com',
      ou: 'core',
      type: 'security',
    },
    {
      key: 'operations',
      id: '444444444444',
      arn: 'arn:aws:organizations::111111111111:account/o-444444444444/444444444444',
      name: 'test-operations',
      email: 'test+pbmm-lz-operations@amazon.com',
      ou: 'core',
    },
    {
      key: 'shared-network',
      id: '555555555555',
      arn: 'arn:aws:organizations::111111111111:account/o-555555555555/555555555555',
      name: 'test-shared-network',
      email: 'test+pbmm-lz-shared-network@amazon.com',
      ou: 'core',
    },
  ];

  const content = fs.readFileSync('../../config.example.json');
  const config = AcceleratorConfig.fromString(content.toString());

  const context = {
    acceleratorName: 'PBMM',
    acceleratorPrefix: 'PBMMAccel-',
    acceleratorExecutionRoleName: 'PBMMAccel-PipelineRole',
    defaultRegion: 'ca-central-1',
  };

  const app = new cdk.App();
  const accountStacks = new AccountStacks(app, {
    accounts,
    context,
    phase,
  });

  const limiter = new Limiter([]);
  const outputs: StackOutput[] = [];
  return {
    acceleratorConfig: config,
    accountStacks,
    accounts,
    app,
    context,
    limiter,
    outputs,
  };
}
