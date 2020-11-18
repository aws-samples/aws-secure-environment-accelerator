import { CloudFormationCustomResourceEvent } from 'aws-lambda';
export interface HandlerProperties {
  subnetIds: string[];
  transitGatewayAttachmentId: string;
  ignoreWhileDeleteSubnets: string[];
}
export declare const handler: (
  event: CloudFormationCustomResourceEvent,
  context: import('aws-lambda').Context,
) => Promise<void>;
