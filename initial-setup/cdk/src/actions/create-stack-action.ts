import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';
import { CreateStackTask } from '../tasks/create-stack-task';

export namespace CreateStackAction {
  export interface Props extends Omit<actions.LambdaInvokeActionProps, 'lambda' | 'inputs' | 'outputs'> {
    actionName: string;
    stackName: string;
    stackCapabilities?: string[];
    stackParameters?: { [key: string]: string };
    stackTemplateArtifact: codepipeline.ArtifactPath;
    assumeRole: iam.IRole;
    lambdaRole: iam.IRole;
    lambdas: WebpackBuild;
    waitSeconds?: number;
  }
}

export class CreateStackAction extends actions.Action {
  private readonly props: CreateStackAction.Props;

  constructor(props: CreateStackAction.Props) {
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

  protected bound(scope: cdk.Construct, stage: codepipeline.IStage, options: codepipeline.ActionBindOptions): codepipeline.ActionConfig {
    const {
      role,
      bucket,
    } = options;

    const {
      actionName,
      stackName,
      stackParameters,
      stackCapabilities,
      stackTemplateArtifact,
      userParameters,
      assumeRole,
      lambdaRole,
      lambdas,
      waitSeconds,
    } = this.props;

    const createStackStateMachine = new sfn.StateMachine(scope, 'CreateStackStateMachine', {
      definition: new CreateStackTask(scope, 'CreateStackTask', {
        role: lambdaRole,
        lambdas,
        waitSeconds,
      }),
    });

    const createStackTriggerLambdaRole = new iam.Role(scope, 'CreateStackLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    createStackTriggerLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['states:StartExecution'],
      resources: [createStackStateMachine.stateMachineArn],
    }));
    createStackTriggerLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
    }));

    const createStackTrigger = new lambda.Function(scope, 'CreateStackTrigger', {
      timeout: cdk.Duration.minutes(15),
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: this.props.lambdas.codeForEntry('create-stack/trigger'),
      role: createStackTriggerLambdaRole,
      environment: {
        STATE_MACHINE_ARN: createStackStateMachine.stateMachineArn,
      },
    });

    const wrapped = new actions.LambdaInvokeAction({
      role,
      actionName,
      lambda: createStackTrigger,
      inputs: [stackTemplateArtifact.artifact],
      userParameters: {
        ...userParameters,
        stackName,
        stackParameters,
        stackCapabilities,
        stackTemplateArtifact: stackTemplateArtifact.artifact.artifactName,
        stackTemplateArtifactPath: stackTemplateArtifact.fileName,
        assumeRoleArn: assumeRole.roleArn,
      },
    });

    return wrapped.bind(scope, stage, options);
  }
}