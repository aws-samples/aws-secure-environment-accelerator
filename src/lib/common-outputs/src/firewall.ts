import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';

export const FirewallConfigReplacementsOutput = t.interface(
  {
    name: t.string,
    instanceId: t.string,
    instanceName: t.string,
    replacements: t.record(t.string, t.string),
  },
  'FirewallConfigReplacementsOutput',
);
export type FirewallConfigReplacementsOutput = t.TypeOf<typeof FirewallConfigReplacementsOutput>;
export const FirewallConfigReplacementsOutputFinder = createStructuredOutputFinder(
  FirewallConfigReplacementsOutput,
  () => ({}),
);
