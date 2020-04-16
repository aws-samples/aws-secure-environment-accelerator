import * as fs from 'fs';
import * as path from 'path';

export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  acceleratorExecutionRoleName: string;
  passwordsKmsKeyArn: string;
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
    passwordsKmsKeyArn: process.env.PASSWORDS_KMS_KEY_ARN!,
  };
}
