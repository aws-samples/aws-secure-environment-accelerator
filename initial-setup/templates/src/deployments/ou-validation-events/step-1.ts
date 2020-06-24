import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStack } from '../../common/account-stacks';
import * as lambda from '@aws-cdk/aws-lambda';
import * as path from 'path';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import { createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface OuValidationStep1Props {
  scope: AccountStack;
  roleName: string;
  acceleratorPrefix: string;
  configFilePath: string;
  configBranch: string;
  configRepositoryName: string;
  defaultRegion: string;
}

export interface MoveAccountProps {
  scope: AccountStack;
  acceleratorPrefix: string;
  configBranch: string;
  configFilePath: string;
  configRepositoryName: string;
  defaultRegion: string;
  pipelineRole: iam.IRole;
  lambdaCode: lambda.Code;
}

/**
 * OU Validation - Handling manual account creation and move account to organizations
 */
export async function step1(props: OuValidationStep1Props) {
  const { scope, roleName, acceleratorPrefix, configBranch, configFilePath, configRepositoryName, defaultRegion } = props;
  const lambdaPath = require.resolve('@aws-pbmm/apps-lambdas');
  const lambdaDir = path.dirname(lambdaPath);
  const lambdaCode = lambda.Code.fromAsset(lambdaDir);
  const roleArn = `arn:aws:iam::${scope.accountId}:role/${roleName}`;
  const pipelineRole = iam.Role.fromRoleArn(scope, 'moveAccountToOrganizationRole', roleArn, {
    mutable: true,
  });

  // Creates resources needed for handling move account directly from console
  await moveAccount({
    scope,
    pipelineRole,
    acceleratorPrefix,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    lambdaCode,
  })
}

async function moveAccount(input: MoveAccountProps) {
  const { 
    scope, 
    pipelineRole, 
    acceleratorPrefix, 
    configBranch, 
    configFilePath, 
    configRepositoryName, 
    defaultRegion,
    lambdaCode,
  } = input;
  const moveAccountFunc = new lambda.Function(scope, 'moveAccountToOrganization', {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: 'index.ouValidationEvents.moveAccount',
    code: lambdaCode,
    role: pipelineRole,
    environment: {
        ACCELERATOR_PREFIX: acceleratorPrefix,
        CONFIG_REPOSITORY_NAME: configRepositoryName,
        CONFIG_FILE_PATH: configFilePath,
        CONFIG_REPOSITORY_BRANCH: configBranch,
        ACCELERATOR_STATEMACHINE_ROLENAME: pipelineRole.roleName,
        ACCELERATOR_DEFAULT_REGION: defaultRegion,
    },
    timeout: cdk.Duration.minutes(15),
  });
    
  moveAccountFunc.addPermission(`InvokePermission-NewLogGroup_rule`, {
    action: 'lambda:InvokeFunction',
    principal: new iam.ServicePrincipal('events.amazonaws.com'),
  });
    
  const moveAccountEventPattern = {
    source: ['aws.organizations'],
    'detail-type': ['AWS API Call via CloudTrail'],
    detail: {
        eventSource: ['organizations.amazonaws.com'],
        eventName: ['MoveAccount'],
    },
  };
    
  const ruleTarget: events.CfnRule.TargetProperty = {
    arn: moveAccountFunc.functionArn,
    id: 'MoveAccountToOrganizationRule',
  };
    
  new events.CfnRule(scope, 'MoveAccountToOrganizationRule', {
    description: 'Adds Account Configuration to config file on successful moveAccount',
    state: 'ENABLED',
    name: createName({
        name: 'MoveAccount_rule'
    }),
    eventPattern: moveAccountEventPattern,
    targets: [ruleTarget],
  });
}