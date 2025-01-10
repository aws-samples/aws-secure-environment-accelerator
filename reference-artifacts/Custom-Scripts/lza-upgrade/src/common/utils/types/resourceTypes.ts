import { CloudFormation } from 'aws-sdk';
import aws from '../../aws/aws-client';

export interface Environment {
    accountId: string;
    accountKey: string;
    region: string;
}

export interface StacksAndResourceMap {
    environment: Environment;
    stackName: string;
    resourceMap: LogicalAndPhysicalResourceIds[];
    region: string;
    template: string;
    phase: string | undefined;
    countVerified: boolean;
    numberOfResources: number;
    numberOfResourcesInTemplate: number;
    nestedStacks?: {
      [key: string]: NestedStack;
    };
    parentStack?: string;
}

export interface CfnClients {
    cfn: CloudFormation;
    cfnNative: aws.CloudFormation;
}

 export interface LogicalAndPhysicalResourceIds {
    logicalResourceId: string;
    physicalResourceId: string;
    resourceType: string;
    resourceMetadata?: string;
  }

  export interface ASEAResourceMapping {
    [key: string]: ASEAMapping;
}

  export interface NestedStack {
        logicalResourceId: string;
        stackName: string;
        accountId: string;
        accountKey: string;
        region: string;
        phase: string | undefined;
        countVerified: boolean;
        numberOfResources: number;
        numberOfResourcesInTemplate: number;
        resourceMap?: LogicalAndPhysicalResourceIds[];
        template?: string;
        templatePath: string;
        resourcePath: string;
}
export interface ASEAMapping {
    stackName: string;
    accountId: string;
    accountKey: string;
    region: string;
    phase: string | undefined;
    countVerified: boolean;
    numberOfResources: number;
    numberOfResourcesInTemplate: number;
    templatePath: string;
    resourcePath: string;
    nestedStacks?: {
        [key: string]: NestedStack;
    };
}