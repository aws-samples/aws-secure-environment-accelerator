import * as cdk from '@aws-cdk/core';
import { AlbConfig, AlbTargetConfig } from '@aws-pbmm/common-lambda/lib/config';
import { CfnLoadBalancer, CfnListener, CfnTargetGroup } from '@aws-cdk/aws-elasticloadbalancingv2';

export interface AlbProps extends cdk.StackProps {
  albConfig: AlbConfig;
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
  bucketName: string;
  ec2Instances?: { [instanceName: string]: string };
  lambdaSources?: { [lambdaFileName: string]: string };
  isOu: boolean;
  accountKey: string;
  certificateArn: string;
}

export class Alb extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AlbProps) {
    super(scope, id);

    const {
      albConfig,
      vpcId,
      subnetIds,
      securityGroupIds,
      bucketName,
      ec2Instances,
      lambdaSources,
      isOu,
      accountKey,
      certificateArn,
    } = props;

    const applicationLoadBalancer = new CfnLoadBalancer(this, 'Alb', {
      name: isOu ? albConfig.name.concat(accountKey).concat('-alb') : albConfig.name,
      ipAddressType: albConfig['ip-type'],
      scheme: albConfig.scheme,
      subnets: subnetIds,
      securityGroups: securityGroupIds,
    });

    if (albConfig['access-logs']) {
      applicationLoadBalancer.loadBalancerAttributes = [
        {
          key: 'access_logs.s3.enabled',
          value: 'true',
        },
        {
          key: 'access_logs.s3.bucket',
          value: bucketName,
        },
        {
          key: 'access_logs.s3.prefix',
          value: 'elb',
        },
      ];
    }

    const targetGroups: string[] = [];
    for (const target of albConfig.targets) {
      if (isOu) {
        targetGroups.push(this.createTargetGroupForLambda(target, albConfig.name, lambdaSources!).ref);
      } else {
        targetGroups.push(this.createTargetGroupForInstance(target, albConfig.name, vpcId, ec2Instances!).ref);
      }
    }

    if (isOu) {
      this.createAlbListenerForLambda(
        `AlbListener${albConfig.name}`,
        albConfig.ports,
        applicationLoadBalancer.ref,
        albConfig.listeners,
        albConfig['action-type'],
        targetGroups,
        albConfig['security-policy'],
        certificateArn,
      );
    } else {
      this.createAlbListenerForInstance(
        `AlbListener${albConfig.name}`,
        albConfig.ports,
        applicationLoadBalancer.ref,
        albConfig.listeners,
        albConfig['action-type'],
        targetGroups,
        albConfig['security-policy'],
        certificateArn,
      );
    }
  }

  createAlbListenerForInstance(
    listenerName: string,
    ports: string,
    loadBalancerArn: string,
    protocol: string,
    actionType: string,
    targetGroupArn: string[],
    sslPolicy: string,
    certificateArn: string,
  ): void {
    const albListener = new CfnListener(this, `${listenerName}`, {
      port: Number(ports),
      loadBalancerArn,
      protocol,
      defaultActions: [],
      sslPolicy,
      certificates: [{ certificateArn }],
    });
    albListener.defaultActions = [
      {
        type: actionType,
        forwardConfig: {
          targetGroups: [
            {
              targetGroupArn: targetGroupArn[0],
              weight: 1,
            },
            {
              targetGroupArn: targetGroupArn[1],
              weight: 1,
            },
          ],
          targetGroupStickinessConfig: {
            enabled: true,
            durationSeconds: 3600,
          },
        },
      },
    ];
  }

  createAlbListenerForLambda(
    listenerName: string,
    ports: string,
    loadBalancerArn: string,
    protocol: string,
    actionType: string,
    targetGroupArn: string[],
    sslPolicy: string,
    certificateArn: string,
  ): void {
    const albListener = new CfnListener(this, `${listenerName}`, {
      port: Number(ports),
      loadBalancerArn,
      protocol,
      defaultActions: [],
      sslPolicy,
      certificates: [{ certificateArn }],
    });
    albListener.defaultActions = [
      {
        type: actionType,
        forwardConfig: {
          targetGroups: [
            {
              targetGroupArn: targetGroupArn[0],
              weight: 1,
            },
          ],
          targetGroupStickinessConfig: {
            enabled: true,
            durationSeconds: 3600,
          },
        },
      },
    ];
  }

  createTargetGroupForInstance(
    target: AlbTargetConfig,
    albName: string,
    vpcId: string,
    instances: { [instanceName: string]: string },
  ): CfnTargetGroup {
    const targetGroup = new CfnTargetGroup(this, `AlbTargetGroup${albName}${target['target-name']}`, {
      name: albName.concat(target['target-name']),
      targetType: target['target-type'],
      protocol: target.protocol,
      port: target.port,
      vpcId,
      healthCheckProtocol: target['health-check-protocol'],
      healthCheckPath: target['health-check-path'],
      healthCheckPort: String(target['health-check-port']),
    });
    targetGroup.targets = [
      {
        id: instances[target['target-instances']![0]],
        port: target.port,
      },
    ];
    return targetGroup;
  }

  createTargetGroupForLambda(
    target: AlbTargetConfig,
    albName: string,
    lambdaFunctionArn: { [lambdaFileName: string]: string },
  ): CfnTargetGroup {
    const targetGroup = new CfnTargetGroup(this, `AlbTargetGroup${albName}${target['target-name']}`, {
      name: albName.concat(target['target-name']),
      targetType: target['target-type'],
      healthCheckPath: target['health-check-path'],
      healthCheckEnabled: true,
    });
    targetGroup.targets = [
      {
        id: lambdaFunctionArn[target['lambda-filename']!],
      },
    ];
    return targetGroup;
  }
}
