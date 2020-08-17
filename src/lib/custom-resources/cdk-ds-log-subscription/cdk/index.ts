import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as ds from '@aws-cdk/aws-directoryservice';
import * as iam from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';

export interface DirectoryServiceLogSubscriptionProps {
  directory: string | ds.CfnMicrosoftAD;
  logGroup: string | logs.LogGroup;
}

export type DirectoryOrName = string | ds.CfnMicrosoftAD | ds.CfnSimpleAD;
export type LogGroupOrName = string | logs.LogGroup | logs.CfnLogGroup;

/**
 * Custom resource implementation that creates log subscription for directory service.
 */
export class DirectoryServiceLogSubscription extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: DirectoryServiceLogSubscriptionProps) {
    super(scope, id);

    const { directory, logGroup } = props;

    const directoryId = getDirectoryId(directory);
    const logGroupName = getLogGroupName(logGroup);

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

    if (logGroup instanceof cdk.Construct) {
      awsCustomResource.node.addDependency(logGroup);
    }
    if (directory instanceof cdk.Construct) {
      awsCustomResource.node.addDependency(directory);
    }
  }
}

function getLogGroupName(value: LogGroupOrName): string {
  if (value instanceof logs.LogGroup) {
    return value.logGroupName;
  } else if (value instanceof logs.CfnLogGroup) {
    return value.logGroupName!;
  }
  return value;
}

function getDirectoryId(value: DirectoryOrName): string {
  if (value instanceof ds.CfnMicrosoftAD) {
    return value.ref;
  } else if (value instanceof ds.CfnSimpleAD) {
    return value.ref;
  }
  return value;
}
