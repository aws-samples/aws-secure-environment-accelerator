import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import { CfnMicrosoftAD } from '@aws-cdk/aws-directoryservice';
import { MadDeploymentConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import * as logs from '@aws-cdk/aws-logs';
import * as iam from '@aws-cdk/aws-iam';
import { createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface ActiveDirectoryProps extends cdk.StackProps {
  madDeploymentConfig: MadDeploymentConfig;
  subnetInfo: {
    vpcId: string;
    subnetIds: string[];
  };
  password: Secret;
}

export class ActiveDirectory extends cdk.Construct {
  readonly directoryId: string;
  readonly dnsIps: string[];

  constructor(scope: cdk.Construct, id: string, props: ActiveDirectoryProps) {
    super(scope, id);
    const { madDeploymentConfig, subnetInfo, password } = props;

    const logGroupName = madDeploymentConfig['log-group-name'];
    const logGroup = new logs.LogGroup(this, 'MadLogGroup', {
      logGroupName: '/aws/directoryservice/' + createName(logGroupName),
    });

    // Allow directory services to write to the log group
    new LogResourcePolicy(this, 'MadLogGroupPolicy', {
      policyName: 'DSLogSubscription',
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          principals: [new iam.ServicePrincipal('ds.amazonaws.com')],
          resources: [logGroup.logGroupArn],
        }),
      ],
    });

    const microsoftAD = new CfnMicrosoftAD(this, 'MicrosoftAD', {
      name: madDeploymentConfig['dns-domain'],
      password: password.secretValue.toString(),
      vpcSettings: {
        subnetIds: subnetInfo.subnetIds,
        vpcId: subnetInfo.vpcId,
      },
      edition: madDeploymentConfig.size,
      shortName: madDeploymentConfig['netbios-domain'],
    });
    this.directoryId = microsoftAD.ref;
    this.dnsIps = microsoftAD.attrDnsIpAddresses;

    // Subscribe directory service to log group
    new DirectoryServiceLogSubscription(this, 'MadLogSubscription', {
      directory: microsoftAD,
      logGroup,
    });
  }
}

export interface LogResourcePolicyProps {
  policyName: string;
  policyStatements?: iam.PolicyStatement[];
}

/**
 * Custom resource implementation that create logs resource policy. Awaiting
 * https://github.com/aws-cloudformation/aws-cloudformation-coverage-roadmap/issues/249
 */
// TODO Move to custom resource
export class LogResourcePolicy extends cdk.Construct {
  private readonly policyName: string;
  private readonly policyDocument: iam.PolicyDocument;

  constructor(scope: cdk.Construct, id: string, props: LogResourcePolicyProps) {
    super(scope, id);
    this.policyName = props.policyName;
    this.policyDocument = new iam.PolicyDocument({
      statements: props.policyStatements,
    });

    const physicalResourceId = custom.PhysicalResourceId.of(this.policyName);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'CloudWatchLogs',
      action: 'putResourcePolicy',
      physicalResourceId,
      parameters: {
        policyName: this.policyName,
        policyDocument: cdk.Lazy.stringValue({
          produce: () => JSON.stringify(this.policyDocument.toJSON()),
        }),
      },
    };

    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::LogResourcePolicy',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      onDelete: {
        service: 'CloudWatchLogs',
        action: 'deleteResourcePolicy',
        physicalResourceId,
        parameters: {
          policyName: this.policyName,
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['logs:PutResourcePolicy', 'logs:DeleteResourcePolicy'],
          resources: ['*'],
        }),
      ]),
    });
  }

  addStatements(...statements: iam.PolicyStatement[]) {
    this.policyDocument.addStatements(...statements);
  }
}

export interface DirectoryServiceLogSubscriptionProps {
  directory: string | CfnMicrosoftAD;
  logGroup: string | logs.LogGroup;
}

/**
 * Custom resource implementation that creates log subscription for directory service.
 */
// TODO Move to custom resource
export class DirectoryServiceLogSubscription extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: DirectoryServiceLogSubscriptionProps) {
    super(scope, id);

    const { directory, logGroup } = props;

    let logGroupName: string;
    if (logGroup instanceof logs.LogGroup) {
      logGroupName = logGroup.logGroupName;
    } else {
      logGroupName = logGroup;
    }

    let directoryId: string;
    if (directory instanceof CfnMicrosoftAD) {
      directoryId = directory.ref;
    } else {
      directoryId = directory;
    }

    const physicalResourceId = custom.PhysicalResourceId.of(`LogSubscription${directoryId}`);

    const awsCustomResource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::DirectoryServiceLogSubscription',
      onCreate: {
        service: 'DirectoryService',
        action: 'createLogSubscription',
        physicalResourceId,
        parameters: {
          DirectoryId: directoryId,
          LogGroupName: logGroupName,
        },
      },
      onDelete: {
        service: 'DirectoryService',
        action: 'deleteLogSubscription',
        physicalResourceId,
        parameters: {
          DirectoryId: directoryId,
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ds:CreateLogSubscription', 'ds:DeleteLogSubscription'],
          resources: ['*'],
        }),
      ]),
    });

    // Workaround to find the CfnResource that are backing this construct
    // Add the log group and the directory as dependencies
    const children = awsCustomResource.node.findAll();
    const resources = children.filter((c): c is cdk.CfnResource => c instanceof cdk.CfnResource);
    for (const resource of resources) {
      if (logGroup instanceof logs.LogGroup) {
        const logGroupChildren = logGroup.node.findAll();
        const logGroupResource = logGroupChildren.find(c => c instanceof cdk.CfnResource) as cdk.CfnResource;
        resource.addDependsOn(logGroupResource);
      }
      if (directory instanceof CfnMicrosoftAD) {
        resource.addDependsOn(directory);
      }
    }
  }
}
