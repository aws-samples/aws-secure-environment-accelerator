import * as fs from 'fs';
import * as path from 'path';

export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  acceleratorExecutionRoleName: string;
  defaultRegion: string;
  acceleratorBaseline: 'LANDING_ZONE' | 'ORGANIZATIONS' | 'CONTROL_TOWER' | string;
  acceleratorPipelineRoleName: string;
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  configBranch: string;
  acceleratorStateMachineName: string;
  configRootFilePath: string;
  installerVersion: string;
  centralOperationsAccount?: string;
  masterAccount?: string;
}

export function loadContext(): Context {
  if (process.env.CONFIG_MODE === 'development') {
    const configPath = path.join(__dirname, '..', '..', 'context.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot find local config.json at "${configPath}"`);
    }
    const contents = fs.readFileSync(configPath);
    return JSON.parse(contents.toString());
  }

  return {
    acceleratorName: process.env.ACCELERATOR_NAME!,
    acceleratorPrefix: process.env.ACCELERATOR_PREFIX!,
    acceleratorExecutionRoleName: process.env.ACCELERATOR_EXECUTION_ROLE_NAME!,
    defaultRegion: process.env.AWS_REGION!,
    acceleratorBaseline: process.env.ACCELERATOR_BASELINE!,
    acceleratorPipelineRoleName: process.env.ACCELERATOR_PIPELINE_ROLE_NAME!,
    configBranch: process.env.CONFIG_BRANCH_NAME!,
    configRepositoryName: process.env.CONFIG_REPOSITORY_NAME!,
    configCommitId: process.env.CONFIG_COMMIT_ID!,
    configFilePath: process.env.CONFIG_FILE_PATH!,
    acceleratorStateMachineName: process.env.ACCELERATOR_STATE_MACHINE_NAME!,
    configRootFilePath: process.env.CONFIG_ROOT_FILE_PATH!,
    installerVersion: process.env.INSTALLER_VERSION!,
  };
}
