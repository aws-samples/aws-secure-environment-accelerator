import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
export declare type Tags = AWS.CloudWatchLogs.Tags;
export interface HandlerProperties {
  logGroupName: string;
  retention?: number;
  tags?: Tags;
}
export declare const handler: (
  event: CloudFormationCustomResourceEvent,
  context: import('aws-lambda').Context,
) => Promise<void>;
