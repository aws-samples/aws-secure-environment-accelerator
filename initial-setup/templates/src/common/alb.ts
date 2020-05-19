import * as cdk from '@aws-cdk/core';
import { AlbConfig, AlbTargetConfig } from '@aws-pbmm/common-lambda/lib/config';
import { CfnLoadBalancer, CfnListener, CfnTargetGroup } from '@aws-cdk/aws-elasticloadbalancingv2';

export interface AlbProps extends cdk.StackProps {
  albConfig: AlbConfig;
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
  bucketName: string;
  instances?: { [instanceName: string]: string };
  lambdaArn?: string;

}

export class Alb extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AlbProps) {
    super(scope, id);

    const { albConfig, vpcId, subnetIds, securityGroupIds, bucketName, instances, lambdaArn } = props;

    const applicationLoadBalancer = new CfnLoadBalancer(this, 'Alb', {
      name: albConfig.name,
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
      // TODO get instanceId and Lambda function Arn
      targetGroups.push(this.createTargetGroup(target, albConfig.name, vpcId, instances, '').ref);
    }

    this.createAlbListener(
      `AlbListener${albConfig.name}`,
      albConfig.ports,
      applicationLoadBalancer.ref,
      albConfig.listeners,
      'forward',
      targetGroups,
      albConfig['security-policy'],
      'arn:aws:acm:ca-central-1:275283254872:certificate/ab542357-1187-46d9-a7a1-259e08a174e0',
    );
  }

  createAlbListener(
    listenerName: string,
    ports: string,
    loadBalancerArn: string,
    protocol: string,
    action_type: string,
    targetGroupArn: string[],
    sslPolicy: string,
    certificateArn: string,
    hasTargetLambda?: string,
  ): void {
    const albListener = new CfnListener(this, `${listenerName}`, {
      port: Number(ports),
      loadBalancerArn: loadBalancerArn,
      protocol,
      defaultActions: [],
      sslPolicy,
      certificates: [{ certificateArn }],
    });

    if (hasTargetLambda) {
      albListener.defaultActions = [
        {
          type: action_type,
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
    } else {
      albListener.defaultActions = [
        {
          type: action_type,
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
  }

  createTargetGroup(
    target: AlbTargetConfig,
    albName: string,
    vpcId: string,
    instances?: { [instanceName: string]: string },
    lambdaFunctionArn?: string,
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
    if (!target['lambda-filename']) {
      targetGroup.targets = [
        {
          id: instances![target["target-instances"]![0]],
          port: target.port,
        },
      ];
    } else {
      targetGroup.targets = [
        {
          id: lambdaFunctionArn!,
        },
      ];
    }
    return targetGroup;
  }
}
