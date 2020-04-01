import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';
import { CreateStackSetTask } from '../tasks/create-stack-set-task';

export namespace CreateStackSetAction {
  export interface Props extends Omit<actions.LambdaInvokeActionProps, 'lambda' | 'inputs' | 'outputs'> {
    actionName: string;
    stackName: string;
    stackCapabilities?: string[];
    stackParameters?: { [key: string]: string };
    stackTemplateArtifact: codepipeline.ArtifactPath;
    accounts: string[];
    regions: string[];
    lambdaRole: iam.Role;
    lambdas: WebpackBuild;
    waitSeconds?: number;
  }
}

export class CreateStackSetAction extends actions.Action {
  private readonly props: CreateStackSetAction.Props;

  constructor(props: CreateStackSetAction.Props) {
    super({
      ...props,
      inputs: [props.stackTemplateArtifact.artifact],
      category: codepipeline.ActionCategory.INVOKE,
      provider: 'Lambda',
      artifactBounds: {
        minInputs: 0,
        maxInputs: 5,
        minOutputs: 0,
        maxOutputs: 5,
      },
    });
    this.props = props;
  }

  protected bound(
    scope: cdk.Construct,
    stage: codepipeline.IStage,
    options: codepipeline.ActionBindOptions,
  ): codepipeline.ActionConfig {
    const { role, bucket } = options;

    const {
      actionName,
      stackName,
      stackParameters,
      stackCapabilities,
      stackTemplateArtifact,
      accounts,
      regions,
      userParameters,
      lambdaRole,
      lambdas,
      waitSeconds,
    } = this.props;

    const createStackSetStateMachine = new sfn.StateMachine(scope, 'CreateStackSetStateMachine', {
      definition: new CreateStackSetTask(scope, 'CreateStackSetTask', {
        role: lambdaRole,
        lambdas,
        waitSeconds,
      }),
    });

    const createStackSetTriggerLambdaRole = new iam.Role(scope, 'CreateStackSetLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    createStackSetTriggerLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['states:StartExecution'],
        resources: [createStackSetStateMachine.stateMachineArn],
      }),
    );
    createStackSetTriggerLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      }),
    );

    const createStackSetTrigger = new lambda.Function(scope, 'CreateStackSetTrigger', {
      timeout: cdk.Duration.minutes(15),
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: this.props.lambdas.codeForEntry('create-stack-set/trigger'),
      role: createStackSetTriggerLambdaRole,
      environment: {
        STATE_MACHINE_ARN: createStackSetStateMachine.stateMachineArn,
      },
    });

    const wrapped = new actions.LambdaInvokeAction({
      role,
      actionName,
      lambda: createStackSetTrigger,
      inputs: [stackTemplateArtifact.artifact],
      userParameters: {
        ...userParameters,
        stackName,
        stackParameters,
        stackCapabilities,
        stackTemplateArtifact: stackTemplateArtifact.artifact.artifactName,
        stackTemplateArtifactPath: stackTemplateArtifact.fileName,
        accounts,
        regions,
      },
    });

    return wrapped.bind(scope, stage, options);
  }
}
