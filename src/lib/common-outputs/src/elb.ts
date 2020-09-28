import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { enumType } from '@aws-accelerator/common-types';

export const LOADBALANCER = ['APPLICATION', 'NETWORK'] as const;

export const LoadBalancerType = enumType<typeof LOADBALANCER[number]>(LOADBALANCER, 'LoadBalancerType');

export const LoadBalancerOutput = t.interface(
  {
    hostedZoneId: t.string,
    dnsName: t.string,
    name: t.string,
    displayName: t.string,
    type: LoadBalancerType,
  },
  'LoadBalancerOutput',
);

export type LoadBalancerOutput = t.TypeOf<typeof LoadBalancerOutput>;

export const LoadBalancerOutputFinder = createStructuredOutputFinder(LoadBalancerOutput, () => ({}));
