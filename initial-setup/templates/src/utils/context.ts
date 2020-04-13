export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
}

export function loadContext() {
  if (process.env.CONFIG_MODE === 'development') {
    return {
      acceleratorName: 'PBMM',
      acceleratorPrefix: 'PBMMAccel-',
    };
  }
  return {
    acceleratorName: process.env.ACCELERATOR_NAME!,
    acceleratorPrefix: process.env.ACCELERATOR_PREFIX!,
  };
}
