import { createCfnStructuredOutput } from '../../common/structured-output';
import { TransitGatewayOutput, TransitGatewayAttachmentOutput } from '@aws-pbmm/common-outputs/lib/transit-gateway';

export const CfnTransitGatewayOutput = createCfnStructuredOutput(TransitGatewayOutput);
export const CfnTransitGatewayAttachmentOutput = createCfnStructuredOutput(TransitGatewayAttachmentOutput);
