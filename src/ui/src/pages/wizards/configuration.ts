import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { getTypeTree } from '@/types';
import { useObservable } from '@/components/accelerator-config-context';

export const InstallationType = t.enums('InstallationType', ['CONTROL_TOWER', 'STANDALONE']);
export type InstallationType = t.TypeOf<typeof InstallationType>;

export const Configuration = t.interface({
  region: t.optional(t.region),
  authenticated: t.boolean,
  controlTowerDetected: t.boolean,
  installationType: InstallationType,
  bucketExists: t.boolean,
  notifications: t.interface({
    statusEmailAddress: t.nonEmptyString,
  }),
});
export type Configuration = t.TypeOf<typeof Configuration>;

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

export type PartialConfiguration = RecursivePartial<Configuration>;

export const AcceleratorConfigurationNode = getTypeTree(c.AcceleratorConfigType);
export const ConfigurationNode = getTypeTree(Configuration);

export const WIZARD_STATE_NAME = 'wizard' as const;
export const WIZARD_CONFIGURATION_NAME = `${WIZARD_STATE_NAME}.configuration` as const;
export const useWizardObservable = () => useObservable(WIZARD_STATE_NAME);
export const useWizardConfigurationObservable = () => useObservable(WIZARD_CONFIGURATION_NAME);

export function acceleratorToWizardConfiguration(value: Readonly<c.AcceleratorConfigType>): Configuration {
  const configGlobalOptions = value['global-options'];

  return {
    region: undefined,
    authenticated: false,
    bucketExists: false,
    controlTowerDetected: false,
    // TODO
    notifications: {
      statusEmailAddress: '',
    },
    installationType: configGlobalOptions['ct-baseline'] ? 'CONTROL_TOWER' : 'STANDALONE',
  };
}
