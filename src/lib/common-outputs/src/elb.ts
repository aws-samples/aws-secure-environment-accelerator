import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { enums } from '@aws-accelerator/common-types';

export const LoadBalancerType = enums('LoadBalancerType', ['APPLICATION', 'NETWORK']);
export type LoadBalancerType = t.TypeOf<typeof LoadBalancerType>;

export const LoadBalancerOutput = t.interface(
  {
    hostedZoneId: t.string,
    dnsName: t.string,
    name: t.string,
    displayName: t.string,
    type: LoadBalancerType,
    arn: t.string,
  },
  'LoadBalancerOutput',
);

export type LoadBalancerOutput = t.TypeOf<typeof LoadBalancerOutput>;

export const LoadBalancerOutputFinder = createStructuredOutputFinder(LoadBalancerOutput, () => ({}));
