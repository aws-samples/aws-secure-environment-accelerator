import * as cdk from '@aws-cdk/core';
import { AccountStack } from '../../common/account-stacks';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';

export interface CreateAccountProps {
  scope: AccountStack;
  acceleratorPrefix: string;
  configBranch: string;
  configFilePath: string;
  configRepositoryName: string;
  defaultRegion: string;
  acceleratorPipelineRole: iam.IRole;
  lambdaCode: lambda.Code;
  acceleratorStateMachineName: string;
  organizationAdminRole: string;
}
export async function createAccount(input: CreateAccountProps) {
  const { scope, lambdaCode, acceleratorPipelineRole, acceleratorPrefix, organizationAdminRole } = input;
  const waitSeconds = 60;

  const accleratorInvocation = new sfn.Pass(scope, 'Acclerator Invocation');

  const waitTask = new sfn.Wait(scope, 'Wait', {
    time: sfn.WaitTime.duration(cdk.Duration.seconds(waitSeconds)),
  });

  const pass = new sfn.Pass(scope, 'Succeeded');

  const fail = new sfn.Fail(scope, 'Failed');

  const verifyTaskResultPath = '$.verifyOutput';
  const verifyTaskStatusPath = `${verifyTaskResultPath}.State`;
  const verifyCreateAccountTask = new CodeTask(scope, 'Verify Create Account', {
    functionProps: {
      code: lambdaCode,
      handler: 'index.ouValidationEvents.createAccount.verify',
      role: acceleratorPipelineRole,
    },
    functionPayload: {
      'requestId.$': '$.detail.responseElements.createAccountStatus.id',
    },
    resultPath: verifyTaskResultPath,
  });

  const attachQuarantineScpTask = new CodeTask(scope, 'Attach Quarantine SCP To Account', {
    resultPath: 'DISCARD',
    functionProps: {
      role: acceleratorPipelineRole,
      code: lambdaCode,
      handler: 'index.ouValidationEvents.createAccount.addScp',
    },
    functionPayload: {
      'accountId.$': '$.verifyOutput.AccountId',
      acceleratorPrefix,
      organizationAdminRole,
    },
  });
  pass.next(attachQuarantineScpTask);

  waitTask.next(verifyCreateAccountTask);

  const invocationCheckTask = new CodeTask(scope, 'Validate Invocation', {
    resultPath: '$.acceleratorInvocation',
    functionProps: {
      role: acceleratorPipelineRole,
      code: lambdaCode,
      handler: 'index.ouValidationEvents.createAccount.invocationCheck',
    },
    functionPayload: {
      'scheduledEvent.$': '$',
      acceleratorRoleName: acceleratorPipelineRole.roleName,
    },
  });

  verifyCreateAccountTask.next(
    new sfn.Choice(scope, 'Account Creation Done?')
      .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'SUCCEEDED'), pass)
      .when(sfn.Condition.stringEquals(verifyTaskStatusPath, 'IN_PROGRESS'), waitTask)
      .otherwise(fail)
      .afterwards(),
  );

  const invokeCheckTask = new sfn.Choice(scope, 'Non Accelerator Invocation?')
    .when(sfn.Condition.booleanEquals('$.acceleratorInvocation', true), accleratorInvocation)
    .otherwise(verifyCreateAccountTask);

  const createStateMachine = new sfn.StateMachine(scope, 'StateMachine', {
    stateMachineName: createName({
      name: 'CreateAccountEventTrigger_sm',
    }),
    definition: sfn.Chain.start(invocationCheckTask.next(invokeCheckTask)),
  });

  const createAccountEventPattern = {
    source: ['aws.organizations'],
    'detail-type': ['AWS API Call via CloudTrail'],
    detail: {
      eventSource: ['organizations.amazonaws.com'],
      eventName: ['CreateAccount'],
    },
  };

  const ruleTarget: events.CfnRule.TargetProperty = {
    arn: createStateMachine.stateMachineArn,
    id: 'CreateAccountRuleTarget',
    roleArn: acceleratorPipelineRole.roleArn,
  };

  new events.CfnRule(scope, 'CreateAccountRule', {
    description: 'Adds Quarantine SCP to newly created Account',
    state: 'ENABLED',
    name: createName({
      name: 'CreateAccount_rule',
    }),
    eventPattern: createAccountEventPattern,
    targets: [ruleTarget],
  });
}
