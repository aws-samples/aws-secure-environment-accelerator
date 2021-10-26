import * as t from 'io-ts';
import { createCfnStructuredOutput } from '../../common/structured-output';
import { SnsTopicOutput } from '@aws-accelerator/common-outputs/src/sns-topic';

export const CfnSnsTopicOutput = createCfnStructuredOutput(SnsTopicOutput);
