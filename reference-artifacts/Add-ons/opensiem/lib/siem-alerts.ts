/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';

export interface AlertsProps {
  alertTopic: sns.ITopic;
  clusterDomainName: string;
}

export class Alerts extends Construct {
  constructor(scope: Construct, id: string, private readonly props: AlertsProps) {
    super(scope, id);

    const { alertTopic, clusterDomainName } = props;

    //
    // CloudWatch Alarm - ClusterStatus.red
    //
    const clusterStatusRedAlarm = new cw.Alarm(this, 'ClusterStatusRed', {
      alarmName: 'OpenSearchSIEM-ClusterStatus.red >= 1',
      alarmDescription: 'Email when ClusterStatus.red >=1, 1 time within 1 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'ClusterStatus.red',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusRedAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusRedAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - ClusterStatus.yellow
    //
    const clusterStatusYellowAlarm = new cw.Alarm(this, 'ClusterStatusYellow', {
      alarmName: 'OpenSearchSIEM-ClusterStatus.yellow >= 1',
      alarmDescription: 'Email when ClusterStatus.yellow >=1, 1 time within 1 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'ClusterStatus.yellow',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusYellowAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusYellowAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - FreeStorageSpace
    //
    const clusterStatusFreeStorageSpaceAlarm = new cw.Alarm(this, 'FreeStorageSpace', {
      alarmName: 'OpenSearchSIEM-FreeStorageSpace <= 20480',
      alarmDescription: 'Email when FreeStorageSpace <= 20480, 1 time within 1 minutes',
      comparisonOperator: cw.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 20480,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'FreeStorageSpace',
        statistic: cw.Statistic.MINIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusFreeStorageSpaceAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusFreeStorageSpaceAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - ClusterIndexWritesBlocked
    //
    const clusterStatusClusterIndexWritesBlockedAlarm = new cw.Alarm(this, 'ClusterIndexWritesBlocked', {
      alarmName: 'OpenSearchSIEM-ClusterIndexWritesBlocked >= 1',
      alarmDescription: 'Email when ClusterIndexWritesBlocked >= 1, 1 time within 1 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'ClusterIndexWritesBlocked',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(300),
      }),
    });
    clusterStatusClusterIndexWritesBlockedAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusClusterIndexWritesBlockedAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - AutomatedSnapshotFailure
    //
    const clusterStatusClusterAutomatedSnapshotFailureAlarm = new cw.Alarm(this, 'AutomatedSnapshotFailure', {
      alarmName: 'OpenSearchSIEM-AutomatedSnapshotFailure >= 1',
      alarmDescription: 'Email when AutomatedSnapshotFailure >= 1, 1 time within 1 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'AutomatedSnapshotFailure',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusClusterAutomatedSnapshotFailureAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusClusterAutomatedSnapshotFailureAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - CPUUtilization
    //
    const clusterStatusClusterCPUUtilizationAlarm = new cw.Alarm(this, 'CPUUtilization', {
      alarmName: 'OpenSearchSIEM-CPUUtilization >= 80',
      alarmDescription: 'Email when CPUUtilization >= 80, 3 times within 15 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 80,
      evaluationPeriods: 3,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'CPUUtilization',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(900),
      }),
    });
    clusterStatusClusterCPUUtilizationAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusClusterCPUUtilizationAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - JVMMemoryPressure
    //
    const clusterStatusJVMMemoryPressureAlarm = new cw.Alarm(this, 'JVMMemoryPressure', {
      alarmName: 'OpenSearchSIEM-JVMMemoryPressure >= 80',
      alarmDescription: 'Email when JVMMemoryPressure >= 80, 3 times within 5 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 80,
      evaluationPeriods: 3,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'JVMMemoryPressure',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(300),
      }),
    });
    clusterStatusJVMMemoryPressureAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusJVMMemoryPressureAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - MasterCPUUtilization
    //
    const clusterStatusMasterCPUUtilizationAlarm = new cw.Alarm(this, 'MasterCPUUtilization', {
      alarmName: 'OpenSearchSIEM-MasterCPUUtilization >= 50',
      alarmDescription: 'Email when MasterCPUUtilization >= 50, 3 times within 5 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 50,
      evaluationPeriods: 3,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'MasterCPUUtilization',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(300),
      }),
    });
    clusterStatusMasterCPUUtilizationAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusMasterCPUUtilizationAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - MasterJVMMemoryPressure
    //
    const clusterStatusMasterJVMMemoryPressureAlarm = new cw.Alarm(this, 'MasterJVMMemoryPressure', {
      alarmName: 'OpenSearchSIEM-MasterJVMMemoryPressure >= 80',
      alarmDescription: 'Email when MasterJVMMemoryPressure >= 80, 1 times within 15 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 80,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'MasterJVMMemoryPressure',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(900),
      }),
    });
    clusterStatusMasterJVMMemoryPressureAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusMasterJVMMemoryPressureAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - Shards.active
    //
    const clusterStatusShardsActiveAlarm = new cw.Alarm(this, 'ShardsActive', {
      alarmName: 'OpenSearchSIEM-ShardsActive >= 30000',
      alarmDescription: 'Email when ShardsActive >= 30000, 1 times within 1 minutes',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 30000,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'Shards.active',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusShardsActiveAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusShardsActiveAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - MasterReachableFromNode
    //
    const clusterStatusMasterReachableFromNodeAlarm = new cw.Alarm(this, 'MasterReachableFromNode', {
      alarmName: 'OpenSearchSIEM-MasterReachableFromNode < 1',
      alarmDescription: 'Email when MasterReachableFromNode < 1, 1 times within 1 day',
      comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'MasterReachableFromNode',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.days(1),
      }),
    });
    clusterStatusMasterReachableFromNodeAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusMasterReachableFromNodeAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - ThreadpoolWriteQueue
    //
    const clusterStatusThreadpoolWriteQueueAlarm = new cw.Alarm(this, 'ThreadpoolWriteQueue', {
      alarmName: 'OpenSearchSIEM-ThreadpoolWriteQueue average >= 100',
      alarmDescription: 'Email when ThreadpoolWriteQueue >= 100, 1 times within 1 minute',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 100,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'ThreadpoolWriteQueue',
        statistic: cw.Statistic.AVERAGE,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusThreadpoolWriteQueueAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusThreadpoolWriteQueueAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - ThreadpoolSearchQueue
    //
    const clusterStatusThreadpoolSearchQueueAlarm = new cw.Alarm(this, 'ThreadpoolSearchQueue', {
      alarmName: 'OpenSearchSIEM-ThreadpoolSearchQueue average >= 500',
      alarmDescription: 'Email when average ThreadpoolSearchQueue >= 500, 1 times within 1 minute',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 500,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'ThreadpoolSearchQueue',
        statistic: cw.Statistic.AVERAGE,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusThreadpoolSearchQueueAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusThreadpoolSearchQueueAlarm.addOkAction(new cwActions.SnsAction(alertTopic));

    //
    // CloudWatch Alarm - ThreadpoolSearchQueue5000
    //
    const clusterStatusThreadpoolSearchQueue5000Alarm = new cw.Alarm(this, 'ThreadpoolSearchQueue5000', {
      alarmName: 'OpenSearchSIEM-ThreadpoolSearchQueue >= 5000',
      alarmDescription: 'Email when ThreadpoolSearchQueue >= 5000, 1 times within 1 minute',
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 5000,
      evaluationPeriods: 1,
      metric: new cw.Metric({
        namespace: 'AWS/ES',
        metricName: 'ThreadpoolSearchQueue',
        statistic: cw.Statistic.MAXIMUM,
        dimensionsMap: {
          ClientId: cdk.Stack.of(this).account,
          DomainName: clusterDomainName,
        },
        period: cdk.Duration.seconds(60),
      }),
    });
    clusterStatusThreadpoolSearchQueue5000Alarm.addAlarmAction(new cwActions.SnsAction(alertTopic));
    clusterStatusThreadpoolSearchQueue5000Alarm.addOkAction(new cwActions.SnsAction(alertTopic));
  }
}
