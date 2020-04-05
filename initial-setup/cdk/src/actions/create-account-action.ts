import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { WebpackBuild } from '@aws-pbmm/common-cdk/lib';
import { CreateAccountTask } from '../tasks/create-account-task';

export namespace CreateAccountAction {
    export interface Props extends Omit<actions.LambdaInvokeActionProps, 'lambda' | 'inputs' | 'outputs'> {
        actionName: string;
        accountName: string;
        lambdaRole: iam.IRole;
        lambdas: WebpackBuild;
        waitSeconds: number;
    }
}

export class CreateAccountAction extends actions.Action {
    private readonly props: CreateAccountAction.Props;

    constructor(props: CreateAccountAction.Props) {
        super({
            ...props,
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
            accountName,
            lambdaRole,
            lambdas,
            waitSeconds,
        } = this.props;

        const createAccountStateMachine = new sfn.StateMachine(scope, 'CreateAccountStateMachine', {
            definition: new CreateAccountTask(scope, 'CreateAccountTask', {
                role: lambdaRole,
                lambdas,
                waitSeconds,
            }),
        });

        const createAccountTriggerLambdaRole = new iam.Role(scope, 'CreateAccountLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        createAccountTriggerLambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['states:StartExecution'],
            resources: [createAccountStateMachine.stateMachineArn],
        }));
        createAccountTriggerLambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
            ],
        }));
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
                'servicecatalog:listPortfolios',
                'servicecatalog:associatePrincipalWithPortfolio',
                'servicecatalog:SearchProducts',
                'servicecatalog:ListProvisioningArtifacts',
                'servicecatalog:ProvisionProduct',
                'servicecatalog:SearchProvisionedProducts',
            ],
        }));
        const createAccountTrigger = new lambda.Function(scope, 'CreateAccountTrigger', {
            timeout: cdk.Duration.minutes(15),
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: 'index.handler',
            code: this.props.lambdas.codeForEntry('create-account/trigger'),
            role: createAccountTriggerLambdaRole,
            environment: {
                STATE_MACHINE_ARN: createAccountStateMachine.stateMachineArn,
            },
        });

        const wrapped = new actions.LambdaInvokeAction({
            role,
            actionName,
            lambda: createAccountTrigger,
            userParameters: {
                accountName,
                principalRoleArn: lambdaRole.roleArn,
            },
        });

        return wrapped.bind(scope, stage, options);
    }
}