import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { getTypeTree } from '@/types';
import { useObservable } from '@/components/accelerator-config-context';

export const Configuration = t.interface({
  region: t.optional(t.region),
  authenticated: t.optional(t.boolean),
  controlTowerDetected: t.optional(t.boolean),
});
export type Configuration = t.TypeOf<typeof Configuration>;

export const AcceleratorConfigurationNode = getTypeTree(c.AcceleratorConfigType);
export const ConfigurationNode = getTypeTree(Configuration);

export const WIZARD_STATE_NAME = 'wizard' as const;
export const useWizardObservable = () => useObservable(WIZARD_STATE_NAME);
