import * as fs from 'fs';
import * as path from 'path';

import { loadAcceleratorConfig } from './config';
import { loadAccounts, Account } from './accounts';
import { loadStackOutputs } from './outputs';
import { loadLimits, LimitOutput, Limiter } from './limits';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

// export interface ContextProps {
//   environment: Context;
//   config: AcceleratorConfig;
//   accounts: Account[];
//   outputs: StackOutput[];
//   limits: LimitOutput[];
// }

// export class Context {
//   readonly environment: Context;
//   readonly config: AcceleratorConfig;
//   readonly accounts: Account[];
//   readonly outputs: StackOutput[];
//   readonly limits: LimitOutput[];
//   readonly limiter: Limiter;

//   constructor(props: ContextProps) {
//     this.environment = props.environment;
//     this.config = props.config;
//     this.accounts = props.accounts;
//     this.outputs = props.outputs;
//     this.limits = props.limits;
//     this.limiter = new Limiter(this.limits);
//   }

//   static async load() {
//     const environment = loadContext();
//     const config = await loadAcceleratorConfig();
//     const accounts = await loadAccounts();
//     const outputs = await loadStackOutputs();
//     const limits = await loadLimits();

//     return new Context({
//       environment,
//       config,
//       accounts,
//       outputs,
//       limits,
//     });
//   }
// }

interface CfnCustomResourceFunctions {
  getDnsIpsFunctionArn: string;
  enableSecurityHubFunctionArn: string;
  inviteMembersSecurityHubFunctionArn: string;
  acceptInviteSecurityHubFunctionArn: string;
}

export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  acceleratorExecutionRoleName: string;
  cfnCustomResourceFunctions: CfnCustomResourceFunctions;
}

export function loadContext(): Context {
  if (process.env.CONFIG_MODE === 'development') {
    // TODO Move to environment.json
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
      enableSecurityHubFunctionArn: process.env.CFN_ENABLE_SECURITY_HUB_LAMBDA_ARN!,
      inviteMembersSecurityHubFunctionArn: process.env.CFN_INVITE_MEMBERS_SECURITY_HUB_LAMBDA_ARN!,
      acceptInviteSecurityHubFunctionArn: process.env.CFN_ACCEPT_INVITE_SECURITY_HUB_LAMBDA_ARN!,
    },
  };
}
