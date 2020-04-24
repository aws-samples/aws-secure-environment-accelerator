import * as fs from 'fs';
import * as path from 'path';

export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  acceleratorExecutionRoleName: string;
  customResourceFunctions: {
    functionName: string;
    functionArn: string;
  }[];
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

  const customResourceFunctions = [
    {
      functionName: process.env.CFN_DNS_ENDPOINT_IPS_FUNCTION_NAME!,
      functionArn: process.env.CFN_DNS_ENDPOINT_IPS_LAMBDA_ARN!,
    },
  ];
  return {
    acceleratorName: process.env.ACCELERATOR_NAME!,
    acceleratorPrefix: process.env.ACCELERATOR_PREFIX!,
    // cfnDnsEndpointIpsLambdaArn: process.env.CFN_DNS_ENDPOINT_IPS_LAMBDA_ARN!,
    acceleratorExecutionRoleName: process.env.ACCELERATOR_EXECUTION_ROLE_NAME!,
    // cfnDnsEndpointIpsFunctionName: process.env.CFN_DNS_ENDPOINT_IPS_FUNCTION_NAME!,
    customResourceFunctions,
  };
}
