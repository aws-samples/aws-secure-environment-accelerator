import { createCfnStructuredOutput } from '../../common/structured-output';
import {
  TransitGatewayOutput,
  TransitGatewayAttachmentOutput,
} from '@aws-accelerator/common-outputs/src/transit-gateway';

export const CfnTransitGatewayOutput = createCfnStructuredOutput(TransitGatewayOutput);
export const CfnTransitGatewayAttachmentOutput = createCfnStructuredOutput(TransitGatewayAttachmentOutput);
