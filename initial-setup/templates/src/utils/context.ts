export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  acceleratorExecutionRoleName: string;
}

export function loadContext() {
  if (process.env.CONFIG_MODE === 'development') {
    return {
      acceleratorName: 'PBMM',
      acceleratorPrefix: 'PBMMAccel-',
      acceleratorExecutionRoleName: 'AcceleratorPipelineRole',
    };
  }
  return {
    acceleratorName: process.env.ACCELERATOR_NAME!,
    acceleratorPrefix: process.env.ACCELERATOR_PREFIX!,
    acceleratorExecutionRoleName: process.env.ACCELERATOR_EXECUTION_ROLE_NAME!,
  };
}
