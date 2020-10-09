import { CloudFormationCustomResourceEvent } from 'aws-lambda';
export interface HandlerProperties {
    vpcId: string;
    domain: string;
    region: string;
    comment: string;
}
export declare const handler: (event: CloudFormationCustomResourceEvent, context: import("aws-lambda").Context) => Promise<void>;
