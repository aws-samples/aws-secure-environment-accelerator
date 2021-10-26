import { CloudFormationCustomResourceEvent } from 'aws-lambda';
export interface HandlerProperties {
  applicationId: string;
  stackName: string;
}
export declare const handler: (
  event: CloudFormationCustomResourceEvent,
  context: import('aws-lambda').Context,
) => Promise<void>;
