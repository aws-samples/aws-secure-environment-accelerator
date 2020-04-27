import * as fs from 'fs';
import * as path from 'path';

interface CfnCustomResourceFunctions {
  getDnsIpsFunctionArn: string;
}

export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  acceleratorExecutionRoleName: string;
  cfnCustomResourceFunctions: CfnCustomResourceFunctions;
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
    cfnCustomResourceFunctions: {
      getDnsIpsFunctionArn: process.env.CFN_DNS_ENDPOINT_IPS_LAMBDA_ARN!,
    },
  };
}
